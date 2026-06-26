from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from models.schemas import (
    PipelineContext, PipelineRequest,
    PlacementRequest, PlacementResponse,
    BacklogRequest, BacklogResponse,
    BurnoutRequest, BurnoutResponse,
    ProjectFailureRequest, ProjectFailureResponse,
    SkillGapRequest, SkillGapResponse,
)
from pipeline import run_pipeline
from agents.predictor import (
    predict_placement, predict_backlog,
    predict_burnout, predict_project_failure,
)
from agents.career_mentor import career_mentor_agent

app = FastAPI(
    title="Guardian AI — Prediction & Agent Service",
    version="2.0.0",
    description="Multi-agent pipeline for academic and career risk prediction",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service", "version": "2.0.0"}


# ── Full 5-agent pipeline ─────────────────────────────────────────────────────

@app.post("/agents/run")
def run_agents(req: PipelineRequest) -> dict:
    """Run the full 5-agent pipeline and return the complete context.
    Sub-Phase D: application tracking signals in req are forwarded to predictor_agent.
    """
    ctx = PipelineContext(
        user_profile=req.user_profile,
        activities=req.activities,
    )
    try:
        result = run_pipeline(ctx, req=req)
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Individual predict endpoints ──────────────────────────────────────────────

@app.post("/predict/placement", response_model=PlacementResponse)
def predict_placement_endpoint(req: PlacementRequest):
    prob, risks = predict_placement(
        cgpa=req.cgpa,
        dsa=req.dsaSolved,
        projects=req.projects,
        skills=len(req.skills),
        attendance=req.attendance,
    )
    return PlacementResponse(probability=prob, topRisks=risks)


@app.post("/predict/backlog", response_model=BacklogResponse)
def predict_backlog_endpoint(req: BacklogRequest):
    prob, risks = predict_backlog(req.cgpa, req.attendance, req.studyHoursPerWeek)
    return BacklogResponse(probability=prob, topRisks=risks)


@app.post("/predict/burnout", response_model=BurnoutResponse)
def predict_burnout_endpoint(req: BurnoutRequest):
    score, risks = predict_burnout(
        req.workHoursPerDay, req.codingHoursPerDay,
        req.sleepHoursPerDay, req.deadlineDensity,
    )
    level = (
        "critical" if score > 0.75 else
        "high"     if score > 0.50 else
        "medium"   if score > 0.25 else "low"
    )
    return BurnoutResponse(score=round(score * 100, 1), level=level, topRisks=risks)


@app.post("/predict/project_failure", response_model=ProjectFailureResponse)
def predict_project_failure_endpoint(req: ProjectFailureRequest):
    prob, risks = predict_project_failure(req.projectCount, req.codingHoursPerDay, req.cgpa)
    return ProjectFailureResponse(probability=prob, topRisks=risks)


@app.post("/skills/gap", response_model=SkillGapResponse)
def skill_gap_endpoint(req: SkillGapRequest):
    from models.schemas import UserProfile
    ctx = PipelineContext(
        user_profile=UserProfile(
            skills=req.skills,
            targetRoles=req.targetRoles,
        )
    )
    ctx = career_mentor_agent(ctx)
    gap = ctx.skill_gap or {}
    return SkillGapResponse(
        missingSkills=gap.get("missingSkills", []),
        presentSkills=gap.get("presentSkills", []),
        coveragePercent=gap.get("coveragePercent", 0),
        recommendedResources=gap.get("recommendedResources", {}),
    )


# ── Conversational Agent endpoints (Sub-Phase C) ─────────────────────────────

from pydantic import BaseModel
from typing import List, Optional
import google.generativeai as genai_conv

_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
if _GEMINI_KEY:
    genai_conv.configure(api_key=_GEMINI_KEY)

def _call_llm(system: str, messages: list, temperature: float = 0.7) -> str:
    """Unified LLM caller — uses google-generativeai (same package as the main pipeline)."""
    if not _GEMINI_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")

    model = genai_conv.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=system,
    )

    # Build history (all but the last message) then send the last one
    history_gc = []
    for m in messages[:-1]:
        role = "user" if m["role"] == "user" else "model"
        history_gc.append({"role": role, "parts": [m["content"]]})

    chat = model.start_chat(history=history_gc)
    last_msg = messages[-1]["content"] if messages else "Hello"
    response = chat.send_message(
        last_msg,
        generation_config={"temperature": temperature},
    )
    return response.text


class ConvMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class MockInterviewRequest(BaseModel):
    topic: str
    previous_answer: Optional[str] = None
    history: List[ConvMessage] = []

class PrepRequest(BaseModel):
    message: str
    focus: str = "aptitude"   # "aptitude" | "coding"
    history: List[ConvMessage] = []


@app.post("/agents/mock-interview")
def mock_interview(req: MockInterviewRequest) -> dict:
    """AI mock interviewer — one question at a time with answer feedback."""
    system = (
        f"You are an experienced technical interviewer conducting a mock interview for: \"{req.topic}\".\n"
        "Rules:\n"
        "- Ask exactly ONE clear interview question at a time.\n"
        "- If the user provides an answer, give concise constructive feedback on correctness and improvement, "
        "then immediately ask the next question.\n"
        "- Keep tone professional and supportive. Do NOT give away answers.\n"
        "- Focus on core concepts relevant to placement exams."
    )
    msgs: list = []
    for h in req.history:
        msgs.append({"role": h.role if h.role == "user" else "model", "content": h.content})

    if req.previous_answer:
        msgs.append({"role": "user", "content": req.previous_answer})
    elif not req.history:
        msgs.append({"role": "user", "content": f"I am ready to start my mock interview on \"{req.topic}\". Ask the first question."})

    try:
        response = _call_llm(system, msgs, temperature=0.6)
        return {"response": response}
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        if "API_KEY_INVALID" in err_str or "API key not valid" in err_str:
            return {"response": "⚠️ The Gemini API key is not valid. Please update GEMINI_API_KEY in the ai-service .env file with a fresh key from https://aistudio.google.com/apikey and restart the AI service."}
        raise HTTPException(status_code=500, detail=err_str)


@app.post("/agents/prep")
def aptitude_prep(req: PrepRequest) -> dict:
    """Aptitude & coding tutor — step-by-step explanations."""
    focus_label = "Coding & Algorithms (DSA, time/space complexity, clean code)" if req.focus == "coding" \
        else "Quantitative Aptitude & Logical Reasoning (formulas, shortcuts, step-by-step solutions)"
    system = (
        f"You are an expert placement test tutor specializing in {focus_label}.\n"
        "Rules:\n"
        "- Explain concepts step-by-step.\n"
        "- For coding questions, provide clean code with complexity analysis.\n"
        "- For aptitude, show formula + worked example + shortcut tip.\n"
        "- Be concise, practical, and exam-focused."
    )
    msgs: list = []
    for h in req.history:
        msgs.append({"role": h.role if h.role == "user" else "model", "content": h.content})
    msgs.append({"role": "user", "content": req.message})

    try:
        response = _call_llm(system, msgs, temperature=0.5)
        return {"response": response}
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        if "API_KEY_INVALID" in err_str or "API key not valid" in err_str:
            return {"response": "⚠️ The Gemini API key is not valid. Please update GEMINI_API_KEY in ai-service/.env and restart the AI service."}
        raise HTTPException(status_code=500, detail=err_str)


# ── Critic Agent ──────────────────────────────────────────────────────────────

class TranscriptEntry(BaseModel):
    question: str
    answer:   str
    feedback: str = ""

class CriticRequest(BaseModel):
    topic:      str
    transcript: List[TranscriptEntry]

@app.post("/agents/critic")
def critic_agent(req: CriticRequest) -> dict:
    """Analyse a completed mock-interview transcript → score + specific weak areas."""
    system = (
        "You are a technical interview critic. Receive a complete mock-interview transcript "
        "and return ONLY valid JSON (no markdown fences) with exactly these keys:\n"
        "  overall_score  - integer 0-100\n"
        "  weak_areas     - array of 3-6 specific, actionable weakness strings\n"
        "  summary        - 2-3 sentence overall critique, direct and constructive\n"
        "Identify patterns across all answers, not just individual questions."
    )
    qa_text = "\n\n".join(
        f"Q{i+1}: {e.question}\nA: {e.answer}\nFeedback: {e.feedback}"
        for i, e in enumerate(req.transcript)
    )
    msgs = [{"role": "user", "content": f"Topic: {req.topic}\n\n{qa_text}"}]
    try:
        raw = _call_llm(system, msgs, temperature=0.2)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        import json as _j; parsed = _j.loads(raw)
        return {
            "overall_score": int(parsed.get("overall_score", 50)),
            "weak_areas":    list(parsed.get("weak_areas", [])),
            "summary":       str(parsed.get("summary", "")),
        }
    except Exception as e:
        err_str = str(e)
        if "API_KEY_INVALID" in err_str or "API key not valid" in err_str:
            return {"overall_score": 50, "weak_areas": ["⚠️ Gemini API key invalid — critique unavailable"], "summary": "API key invalid."}
        raise HTTPException(status_code=500, detail=f"Critic failed: {err_str}")


# ── Interview Complete (Critic → Planner) ────────────────────────────────────

class InterviewCompleteRequest(BaseModel):
    topic:      str
    transcript: List[TranscriptEntry]
    cgpa:       float | None = None
    dsa_solved: int = 0

@app.post("/agents/interview-complete")
def interview_complete(req: InterviewCompleteRequest) -> dict:
    """Runs Critic then Planner. Returns overall_score, weak_areas, summary, action_plan."""
    critique = critic_agent(CriticRequest(topic=req.topic, transcript=req.transcript))

    from agents.planner import planner_agent  # type: ignore
    from models.schemas import PipelineContext, UserProfile  # type: ignore
    from datetime import date as _date

    profile = UserProfile(
        name="user", cgpa=req.cgpa or 7.0, attendance=75.0,
        dsaSolved=req.dsa_solved, projectCount=1, skills=[],
        targetRoles=["Software Engineer"], recentActivities=[], weeklyGoals={},
    )
    ctx = PipelineContext(user_profile=profile)
    ctx = planner_agent(ctx, interview_weak_areas=critique["weak_areas"], target_date=_date.today().isoformat())

    plan = ctx.plan
    return {
        "overall_score": critique["overall_score"],
        "weak_areas":    critique["weak_areas"],
        "summary":       critique["summary"],
        "action_plan": {
            "daily":              plan.get("daily", []),
            "weekly":             plan.get("weekly", []),
            "monthly":            plan.get("monthly", []),
            "structuredSchedule": plan.get("structuredSchedule", {}),
        },
    }



# ── Resume Review Agent ────────────────────────────────────────────────────────

class ResumeReviewRequest(BaseModel):
    resume_text: str
    target_role: str = "Software Engineer"

@app.post("/agents/resume-review")
def resume_review(req: ResumeReviewRequest) -> dict:
    """Structured resume analysis against a target role. Returns JSON-parseable markdown."""
    system = (
        "You are an expert technical recruiter and ATS specialist. "
        "Analyse the provided resume text against the target role and respond ONLY with a valid JSON object "
        "(no markdown fences, no prose outside the JSON). "
        "The JSON must have exactly these keys:\n"
        "  summary      - 2-3 sentence overall assessment (string)\n"
        "  ats_score    - integer 0-100 estimating ATS match for the role\n"
        "  strengths    - array of 3-5 strength bullet strings\n"
        "  improvements - array of 3-5 concrete improvement bullet strings\n"
        "  keywords     - array of 8-12 important keywords present or missing\n"
        "  raw_markdown - a nicely formatted markdown version of the full review (string, use \\n for newlines)\n"
        "Be direct, specific, and actionable."
    )

    msgs = [
        {
            "role": "user",
            "content": (
                f"Target role: {req.target_role}\n\n"
                f"Resume text:\n{req.resume_text[:8000]}"  # cap at 8k chars
            ),
        }
    ]

    try:
        raw = _call_llm(system, msgs, temperature=0.3)

        # Strip markdown fences if model added them anyway
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]

        import json as _json
        parsed = _json.loads(raw)

        # Validate / coerce types
        return {
            "summary":      str(parsed.get("summary", "")),
            "ats_score":    int(parsed.get("ats_score", 0)),
            "strengths":    list(parsed.get("strengths", [])),
            "improvements": list(parsed.get("improvements", [])),
            "keywords":     list(parsed.get("keywords", [])),
            "raw_markdown": str(parsed.get("raw_markdown", raw)),
        }
    except Exception as e:
        err_str = str(e)
        if "API_KEY_INVALID" in err_str or "API key not valid" in err_str:
            raise HTTPException(status_code=503, detail="Gemini API key not valid. Please update ai-service/.env.")
        # JSON parse error — return raw text wrapped
        raise HTTPException(status_code=500, detail=f"Resume review failed: {err_str}")


# ── Schedule Generation ───────────────────────────────────────────────────────

class ScheduleRequest(BaseModel):
    user_id:              str
    target_date:          str               # YYYY-MM-DD
    missed_task_days:     int = 0
    interview_weak_areas: List[str] = []
    cgpa:                 float | None = None
    dsa_solved:           int = 0

@app.post("/schedule/generate")
def generate_schedule(req: ScheduleRequest) -> dict:
    """Generate a structured time-blocked schedule for a single day.
    Calls the upgraded Planner agent with all available weak-area signals.
    """
    from agents.planner import planner_agent  # type: ignore
    from models.schemas import PipelineContext, UserProfile  # type: ignore

    # Build a minimal PipelineContext so the Planner can run
    profile = UserProfile(
        name="user",
        cgpa=req.cgpa or 7.0,
        attendance=75.0,
        dsaSolved=req.dsa_solved,
        projectCount=1,
        skills=[],
        targetRoles=["Software Engineer"],
        recentActivities=[],
        weeklyGoals={},
    )
    ctx = PipelineContext(user_profile=profile)

    ctx = planner_agent(
        ctx,
        interview_weak_areas=req.interview_weak_areas,
        missed_task_days=req.missed_task_days,
        target_date=req.target_date,
    )

    schedule = ctx.plan.get("structuredSchedule", {})
    return {"schedule": schedule}


# ── Phase 5c: Semester Exam Prep ─────────────────────────────────────────────

class GenerateTestRequest(BaseModel):
    subject:       str
    notes_text:    str = ""
    total_marks:   int = 50
    num_questions: int = 10
    difficulty:    str = "mixed"   # easy | medium | hard | mixed

@app.post("/exam/generate-test")
def generate_test(req: GenerateTestRequest) -> dict:
    """Generate a model test from notes/PYQ text → structured JSON with questions + model answers."""
    system = (
        "You are an experienced university examiner. "
        "Generate a semester exam model test as ONLY valid JSON (no markdown fences) "
        "with exactly one key: \"questions\" — an array of objects, each with:\n"
        "  no           - integer question number\n"
        "  question     - the question text (clear, precise, university-style)\n"
        "  marks        - integer marks for this question\n"
        "  model_answer - a concise ideal answer (3-6 sentences or key points)\n"
        "  type         - \"theory\" | \"numerical\" | \"diagram\" | \"application\"\n\n"
        f"Total marks must sum to exactly {req.total_marks}. "
        f"Generate exactly {req.num_questions} questions. "
        f"Difficulty: {req.difficulty}. "
        "Cover multiple topics from the material. Never repeat the same concept twice."
    )
    material = req.notes_text[:6000] if req.notes_text else "Generate a general exam for this subject."
    msgs = [{"role": "user", "content": f"Subject: {req.subject}\n\nStudy material:\n{material}"}]
    try:
        raw = _call_llm(system, msgs, temperature=0.4)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        import json as _j
        parsed = _j.loads(raw)
        questions = parsed.get("questions", [])
        for i, q in enumerate(questions):
            q["no"]    = q.get("no", i + 1)
            q["marks"] = int(q.get("marks", max(1, req.total_marks // req.num_questions)))
        return {
            "subject":    req.subject,
            "questions":  questions,
            "totalMarks": sum(q["marks"] for q in questions),
        }
    except Exception as e:
        err = str(e)
        if "API_KEY_INVALID" in err or "API key not valid" in err:
            raise HTTPException(status_code=503, detail="Gemini API key invalid")
        raise HTTPException(status_code=500, detail=f"Test generation failed: {err}")


class QuestionMeta(BaseModel):
    no:           int
    question:     str
    marks:        int
    model_answer: str

class EvaluateRequest(BaseModel):
    subject:          str
    questions:        List[QuestionMeta]
    answer_text:      str = ""      # typed answers
    answer_image_b64: str = ""      # base64 JPG/PNG of handwritten sheet

@app.post("/exam/evaluate-submission")
def evaluate_submission(req: EvaluateRequest) -> dict:
    """Grade a student submission. Accepts typed text OR a base64 image (handwritten).
    Returns per-question awarded marks + feedback + overall comments.
    """
    student_text = req.answer_text.strip()

    # OCR path: use Gemini multimodal to transcribe handwritten image
    if not student_text and req.answer_image_b64:
        if not _GEMINI_KEY:
            raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
        try:
            import base64 as _b64
            import google.generativeai as _genai_mm
            import google.generativeai.types as _types
            _genai_mm.configure(api_key=_GEMINI_KEY)
            mm_model = _genai_mm.GenerativeModel("gemini-1.5-flash")
            image_bytes = _b64.b64decode(req.answer_image_b64)
            ocr_resp = mm_model.generate_content([
                "You are an OCR engine. Transcribe this handwritten exam answer sheet "
                "exactly as written, preserving question numbering. Output raw text only.",
                _types.Part.from_bytes(image_bytes, mime_type="image/jpeg"),
            ])
            student_text = ocr_resp.text.strip()
        except Exception as ocr_err:
            raise HTTPException(status_code=500, detail=f"OCR failed: {ocr_err}")

    if not student_text:
        raise HTTPException(status_code=400, detail="No answer text or image provided")

    qa_block = "\n\n".join(
        f"Q{q.no} [{q.marks} marks]: {q.question}\nModel Answer: {q.model_answer}"
        for q in req.questions
    )
    system = (
        "You are a strict but fair university professor grading an exam. "
        "Return ONLY valid JSON (no markdown fences) with exactly these keys:\n"
        "  per_question     - array of { no, awarded, feedback } "
        "(awarded = integer marks, feedback = 1-2 sentence reason)\n"
        "  total_awarded    - integer total marks awarded\n"
        "  max_marks        - integer total marks possible\n"
        "  overall_feedback - 2-3 sentence holistic feedback\n\n"
        "Rules: partial credit allowed, never exceed per-question max, check concepts not wording."
    )
    msgs = [{
        "role": "user",
        "content": (
            f"Subject: {req.subject}\n\n"
            f"Questions and model answers:\n{qa_block}\n\n"
            f"Student's answer sheet:\n{student_text[:5000]}"
        ),
    }]
    try:
        raw = _call_llm(system, msgs, temperature=0.2)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        import json as _j
        parsed = _j.loads(raw)
        return {
            "perQuestion":     parsed.get("per_question", []),
            "totalAwarded":    int(parsed.get("total_awarded", 0)),
            "maxMarks":        int(parsed.get("max_marks", sum(q.marks for q in req.questions))),
            "overallFeedback": str(parsed.get("overall_feedback", "")),
            "studentText":     student_text[:500],
        }
    except Exception as e:
        err = str(e)
        if "API_KEY_INVALID" in err or "API key not valid" in err:
            raise HTTPException(status_code=503, detail="Gemini API key invalid")
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {err}")


# ── Phase 6a: Health & Diet ───────────────────────────────────────────────────

class HealthAnalyzeRequest(BaseModel):
    report_text: str                # OCR'd / pasted text of the medical report (max 8000 chars)
    report_type: str = "blood_test" # blood_test | full_body_checkup | ecg | other

@app.post("/health/analyze-report")
def analyze_health_report(req: HealthAnalyzeRequest) -> dict:
    """Extract structured health metrics from a medical report.
    Returns ONLY a JSON object — never echoes back raw sensitive text.
    """
    system = (
        "You are a clinical data extraction AI. "
        "Extract structured health metrics from the provided medical report text. "
        "Return ONLY a valid JSON object (no markdown fences) with exactly these keys:\n"
        "  report_type    - string (blood_test | full_body | ecg | other)\n"
        "  key_metrics    - object: { metric_name: { value, unit, normal_range, status } } "
        "where status is 'normal'|'low'|'high'|'critical'\n"
        "  flags          - array of strings: concerning findings (e.g. 'Low Haemoglobin: 9.2 g/dL')\n"
        "  dietary_notes  - array of strings: dietary implications (e.g. 'Increase iron-rich foods')\n"
        "  summary        - 2-3 sentence plain-English summary for a non-medical reader\n\n"
        "CRITICAL: Do NOT include the patient's name, ID, hospital, or date in the response. "
        "Only extract medical values and their interpretation."
    )
    msgs = [{"role": "user", "content": f"Report type: {req.report_type}\n\nReport text:\n{req.report_text[:8000]}"}]
    try:
        raw = _call_llm(system, msgs, temperature=0.1)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        import json as _j
        parsed = _j.loads(raw)
        return {
            "reportType":   str(parsed.get("report_type", req.report_type)),
            "keyMetrics":   dict(parsed.get("key_metrics", {})),
            "flags":        list(parsed.get("flags", [])),
            "dietaryNotes": list(parsed.get("dietary_notes", [])),
            "summary":      str(parsed.get("summary", "")),
        }
    except Exception as e:
        err = str(e)
        if "API_KEY_INVALID" in err or "API key not valid" in err:
            raise HTTPException(status_code=503, detail="Gemini API key invalid")
        raise HTTPException(status_code=500, detail=f"Health analysis failed: {err}")


class DietPlanRequest(BaseModel):
    flags:        List[str] = []     # concerning findings from analyze-report
    dietary_notes: List[str] = []   # dietary implications from analyze-report
    summary:      str = ""          # health summary from analyze-report
    weight_kg:    float | None = None
    height_cm:    float | None = None
    age:          int | None = None
    activity_level: str = "moderate"  # sedentary | light | moderate | active
    goal:         str = "balanced"    # balanced | weight_loss | muscle_gain | therapeutic

@app.post("/health/generate-diet")
def generate_diet_plan(req: DietPlanRequest) -> dict:
    """Generate a personalised 7-day diet plan from health metrics.
    Returns structured weekly plan — no raw health data echoed back.
    """
    # Compute rough TDEE if measurements provided
    tdee_note = ""
    if req.weight_kg and req.height_cm and req.age:
        bmr = 10 * req.weight_kg + 6.25 * req.height_cm - 5 * req.age + 5
        activity_factors = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725}
        tdee = bmr * activity_factors.get(req.activity_level, 1.55)
        tdee_note = f"Estimated TDEE: {int(tdee)} kcal/day. "

    flags_text    = "\n".join(f"- {f}" for f in req.flags) if req.flags else "None"
    diet_text     = "\n".join(f"- {d}" for d in req.dietary_notes) if req.dietary_notes else "None"

    system = (
        "You are a registered dietitian. Create a personalised 7-day Indian diet plan. "
        "Return ONLY a valid JSON object (no markdown fences) with exactly these keys:\n"
        "  tdee           - integer estimated daily calorie target\n"
        "  goal           - string description of dietary goal\n"
        "  days           - array of 7 day objects, each with:\n"
        "    day          - 1-7\n"
        "    meals        - object: { breakfast, mid_morning, lunch, evening_snack, dinner } "
        "each being a string description of the meal\n"
        "    macros       - { calories, protein_g, carbs_g, fat_g }\n"
        "  weekly_tips    - array of 3-5 actionable weekly tips\n"
        "  foods_to_avoid - array of foods to avoid based on health flags\n\n"
        f"{tdee_note}"
        f"Goal: {req.goal}. Activity: {req.activity_level}. "
        "Use common Indian foods (dal, roti, rice, sabzi, fruits, etc.). "
        "Ensure variety across days. Prioritise therapeutic corrections first."
    )
    msgs = [{
        "role": "user",
        "content": (
            f"Health flags:\n{flags_text}\n\n"
            f"Dietary notes from report:\n{diet_text}\n\n"
            f"Health summary: {req.summary}"
        ),
    }]
    try:
        raw = _call_llm(system, msgs, temperature=0.5)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        import json as _j
        parsed = _j.loads(raw)
        days = parsed.get("days", [])
        summary_line = (
            f"{req.goal.title()} plan · ~{parsed.get('tdee', '?')} kcal/day · "
            f"{len(days)} days"
        )
        return {
            "tdee":          parsed.get("tdee", 0),
            "goal":          str(parsed.get("goal", req.goal)),
            "days":          days,
            "weeklyTips":    list(parsed.get("weekly_tips", [])),
            "foodsToAvoid":  list(parsed.get("foods_to_avoid", [])),
            "summaryText":   summary_line,
        }
    except Exception as e:
        err = str(e)
        if "API_KEY_INVALID" in err or "API key not valid" in err:
            raise HTTPException(status_code=503, detail="Gemini API key invalid")
        raise HTTPException(status_code=500, detail=f"Diet plan generation failed: {err}")


# ── Phase 6b: Guardian Companion ─────────────────────────────────────────────

class CompanionContext(BaseModel):
    """Full student snapshot passed from the Node backend."""
    student_name:        str = "Student"
    placement_score:     float | None = None   # 0-100 from predictor
    burnout_score:       float | None = None
    schedule_completion: float | None = None   # 0-1 last 7 days
    missed_days:         int = 0               # consecutive days with <50% completion
    active_apps:         int = 0
    days_since_last_app: int | None = None
    pending_oa:          int = 0               # OA emails unactioned
    offer_letters:       int = 0
    rejections_recent:   int = 0
    exam_subjects:       int = 0              # subjects with no test yet
    health_flags:        List[str] = []
    top_risks:           List[str] = []
    today_blocks:        int = 0              # blocks scheduled today
    done_today:          int = 0              # blocks completed today
    current_time_hour:   int = 8             # 0-23, for contextual tone
    extra_context:       str = ""            # any free-form context

class BriefingResponse(BaseModel):
    mood:           str        # guardian mood: "proud"|"concerned"|"alert"|"encouraging"|"critical"
    headline:       str        # one punchy sentence guardian says
    focus_today:    str        # the single most important thing to do today
    schedule_note:  str        # comment on today's schedule
    nudges:         List[str]  # 1-4 specific actionable nudges
    alerts:         List[str]  # urgent items (OA deadlines, critical health, missed days streak)
    escalation:     str        # "green"|"yellow"|"orange"|"red"
    affirmation:    str        # one encouraging closing line

@app.post("/companion/briefing", response_model=BriefingResponse)
def companion_briefing(ctx: CompanionContext) -> BriefingResponse:
    """Generate a structured daily Guardian briefing from student's full context."""
    system = (
        "You are Guardian AI — a caring but direct personal mentor and guardian for a student. "
        "You have access to the student's full academic and career data. "
        "Your job is to generate a structured daily briefing. "
        "Return ONLY a valid JSON object (no markdown fences) with exactly these keys:\n"
        "  mood         - one of: proud | concerned | alert | encouraging | critical\n"
        "  headline     - one punchy sentence (max 15 words) that sums up how the student is doing today\n"
        "  focus_today  - THE single most important action the student must do today (be specific)\n"
        "  schedule_note - one sentence about their schedule/task completion pattern\n"
        "  nudges       - array of 2-4 specific actionable nudge strings (not generic advice)\n"
        "  alerts       - array of 0-3 urgent alert strings (empty if nothing critical)\n"
        "  escalation   - 'green' (on track) | 'yellow' (mild concern) | 'orange' (needs attention) | 'red' (critical)\n"
        "  affirmation  - one warm, specific closing line (reference something real from their data)\n\n"
        "Tone rules:\n"
        "- Be direct and honest, never sycophantic\n"
        "- Use the student's name\n"
        "- Reference specific numbers from the context (e.g. '3 applications' not 'some applications')\n"
        "- escalation=red only if placement_score<30 OR missed_days>5 OR critical health flag\n"
        "- escalation=orange if missed_days>2 OR schedule_completion<0.4 OR 0 active_apps\n"
        "- escalation=yellow if schedule_completion<0.7 OR days_since_last_app>7\n"
        "- escalation=green otherwise"
    )

    snapshot = (
        f"Student: {ctx.student_name}\n"
        f"Time of day: {ctx.current_time_hour}:00\n\n"
        f"PLACEMENT:\n"
        f"  Placement probability: {ctx.placement_score:.0f}% ({ctx.placement_score:.1f}/100)\n" if ctx.placement_score else "  Placement probability: unknown\n"
    ) + (
        f"  Active job applications: {ctx.active_apps}\n"
        f"  Days since last application: {ctx.days_since_last_app if ctx.days_since_last_app is not None else 'never applied'}\n"
        f"  Pending OA emails to action: {ctx.pending_oa}\n"
        f"  Offer letters received: {ctx.offer_letters}\n"
        f"  Recent rejections: {ctx.rejections_recent}\n\n"
        f"DAILY SCHEDULE:\n"
        f"  Completion last 7 days: {(ctx.schedule_completion or 0) * 100:.0f}%\n"
        f"  Consecutive low-completion days: {ctx.missed_days}\n"
        f"  Today: {ctx.done_today}/{ctx.today_blocks} blocks done\n\n"
        f"BURNOUT: {ctx.burnout_score:.0f}% risk\n" if ctx.burnout_score else "BURNOUT: unknown\n"
    ) + (
        f"EXAM PREP: {ctx.exam_subjects} subject(s) with no practice tests yet\n\n"
        f"HEALTH FLAGS: {', '.join(ctx.health_flags) if ctx.health_flags else 'None'}\n\n"
        f"TOP AI RISKS: {'; '.join(ctx.top_risks[:3]) if ctx.top_risks else 'None'}\n\n"
        f"EXTRA: {ctx.extra_context}" if ctx.extra_context else ""
    )

    msgs = [{"role": "user", "content": f"Generate today's Guardian briefing:\n\n{snapshot}"}]
    try:
        raw = _call_llm(system, msgs, temperature=0.55)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        import json as _j
        parsed = _j.loads(raw)
        return BriefingResponse(**{k: parsed.get(k, "") for k in BriefingResponse.model_fields})
    except Exception as e:
        # Fallback safe briefing
        score = ctx.placement_score or 0
        esc = "red" if ctx.missed_days > 5 or score < 30 else "orange" if ctx.missed_days > 2 else "yellow"
        return BriefingResponse(
            mood="encouraging",
            headline=f"Stay focused, {ctx.student_name} — every day counts.",
            focus_today="Complete your scheduled study blocks for today.",
            schedule_note=f"You've completed {(ctx.schedule_completion or 0)*100:.0f}% of tasks lately.",
            nudges=[
                "Review your to-do list and pick the hardest task first.",
                "Apply to at least one new job today.",
            ],
            alerts=["AI briefing failed — showing fallback. Check AI service logs."],
            escalation=esc,
            affirmation="Consistency beats perfection. Keep going.",
        )


class CompanionChatRequest(BaseModel):
    history:  List[ConvMessage] = []
    message:  str
    context:  CompanionContext

@app.post("/companion/chat")
def companion_chat(req: CompanionChatRequest) -> dict:
    """Holistic guardian mentor chat — knows full student context, responds like a caring human."""
    score_line = f"Placement probability: {req.context.placement_score:.0f}%" if req.context.placement_score else ""
    system = (
        f"You are Guardian AI, the student's personal AI guardian and mentor. "
        f"You care deeply about {req.context.student_name}'s success and wellbeing. "
        f"You know everything about them:\n\n"
        f"  {score_line}\n"
        f"  Schedule completion (7d): {(req.context.schedule_completion or 0)*100:.0f}%\n"
        f"  Missed days streak: {req.context.missed_days}\n"
        f"  Active job applications: {req.context.active_apps}\n"
        f"  Days since last application: {req.context.days_since_last_app}\n"
        f"  Pending OA invites: {req.context.pending_oa}\n"
        f"  Health flags: {', '.join(req.context.health_flags) if req.context.health_flags else 'none'}\n"
        f"  Top AI risks: {'; '.join(req.context.top_risks[:3]) if req.context.top_risks else 'none'}\n\n"
        "Personality rules:\n"
        "- You are warm but honest — never say 'great job' for mediocre effort\n"
        "- You reference specific data (numbers) when giving advice\n"
        "- You proactively bring up concerns the student didn't ask about if they're urgent\n"
        "- You give concrete, actionable advice — not generic platitudes\n"
        "- Keep responses concise (2-5 sentences) unless a detailed explanation is needed\n"
        "- You are allowed to gently push back if the student is making excuses\n"
        "- You celebrate real wins with genuine enthusiasm"
    )
    msgs = [{"role": m.role, "content": m.content} for m in req.history]
    msgs.append({"role": "user", "content": req.message})
    try:
        reply_text = _call_llm(system, msgs, temperature=0.7)
        return {"reply": reply_text.strip()}
    except Exception as e:
        return {"reply": f"I'm having trouble connecting right now. Error: {e}"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", "8000"))
    host = os.getenv("AI_SERVICE_HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True)
