"""Agent 5 — Planner
Synthesises outputs from all previous agents into a structured action plan.
Phase 5b: Now also emits a structured time-blocked ScheduleDay so the backend
can persist it into ScheduleDay/ScheduleBlock tables.
"""
from __future__ import annotations
import json
from datetime import date
from models.schemas import PipelineContext


def _get_llm_caller():
    try:
        from main import _call_llm  # type: ignore
        return _call_llm
    except Exception:
        return None


def _build_structured_schedule(
    target_date: str,
    all_weak: list[str],
    missing_skills: list[str],
    burnout_level: str,
    placement_pct: float,
    missed_task_days: int,
) -> dict:
    """Ask LLM to produce a time-blocked schedule JSON; fall back to logic if unavailable."""
    recalibrated = missed_task_days >= 2
    system = (
        "You are a study-schedule planner AI. Produce a single day's schedule as valid JSON "
        "with exactly these top-level keys: date (YYYY-MM-DD string), generatedReason (string), "
        "blocks (array). Each block must have: startTime (HH:MM), endTime (HH:MM), activity (string), "
        "category (one of: weak_area_practice, job_readiness, diet, exam_prep, rest), "
        "sourceType (one of: predictor, mock_interview, manual). "
        "Time range 06:00-23:00. No overlapping blocks. 6-10 blocks total. Include rest/meal blocks. "
        + ("Keep all sessions ≤30 min — user missed tasks recently, rebuild momentum gently. " if recalibrated else "")
        + "Respond ONLY with the JSON object — no markdown fences, no prose outside the JSON."
    )
    parts = []
    if all_weak:
        parts.append(f"Weak areas (combined): {', '.join(all_weak[:4])}")
    if missing_skills:
        parts.append(f"Missing skills: {', '.join(missing_skills[:3])}")
    parts.append(f"Burnout: {burnout_level} | Placement readiness: {int(placement_pct)}%")
    if recalibrated:
        parts.append(f"Missed tasks for {missed_task_days} consecutive days — shorter sessions please.")

    _call_llm = _get_llm_caller()
    if _call_llm:
        try:
            raw = _call_llm(system, [{"role": "user", "content": f"Date: {target_date}\n" + "\n".join(parts)}], temperature=0.3)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(raw)
        except Exception:
            pass  # fall through to logic fallback

    # ── Pure-logic fallback ──────────────────────────────────────────────────
    blocks = [
        {"startTime": "06:00", "endTime": "06:30", "activity": "Morning routine & hydration", "category": "rest", "sourceType": "manual"},
    ]
    session = 30 if recalibrated else 60
    slot = 7 * 60  # 07:00

    for area in all_weak[:2]:
        s = f"{slot // 60:02d}:{slot % 60:02d}"; slot += session
        e = f"{slot // 60:02d}:{slot % 60:02d}"; slot += 15
        blocks.append({"startTime": s, "endTime": e, "activity": f"Practice: {area}", "category": "weak_area_practice", "sourceType": "predictor"})

    for skill in missing_skills[:1]:
        s = f"{slot // 60:02d}:{slot % 60:02d}"; slot += session
        e = f"{slot // 60:02d}:{slot % 60:02d}"; slot += 15
        blocks.append({"startTime": s, "endTime": e, "activity": f"Skill: {skill}", "category": "job_readiness", "sourceType": "predictor"})

    blocks += [
        {"startTime": "13:00", "endTime": "13:45", "activity": "Lunch break", "category": "rest", "sourceType": "manual"},
        {"startTime": "20:00", "endTime": "20:30", "activity": "Review today's notes", "category": "weak_area_practice", "sourceType": "manual"},
        {"startTime": "22:30", "endTime": "23:00", "activity": "Wind down — no screens", "category": "rest", "sourceType": "manual"},
    ]
    reason = ("Recalibrated — shorter sessions to rebuild momentum" if recalibrated
              else f"Based on weak areas: {', '.join(all_weak[:2]) or 'general improvement'}")
    return {"date": target_date, "generatedReason": reason, "blocks": blocks}


def planner_agent(
    ctx: PipelineContext,
    interview_weak_areas: list[str] | None = None,
    missed_task_days: int = 0,
    target_date: str | None = None,
) -> PipelineContext:
    predictions = ctx.predictions or {}
    skill_gap   = ctx.skill_gap   or {}
    weaknesses  = ctx.weaknesses  or {}
    status      = ctx.current_status or {}

    placement_pct  = predictions.get("placement", {}).get("percentage", 0)
    burnout_level  = predictions.get("burnout",   {}).get("level", "low")
    backlog_pct    = predictions.get("backlog",   {}).get("percentage", 0)
    missing_skills = skill_gap.get("topMissingSkills", [])
    weak_areas     = weaknesses.get("weakAreas", [])
    dsa            = ctx.user_profile.dsaSolved
    coding_hrs     = status.get("weeklyStats", {}).get("codingHours", 0)
    sleep_hrs      = status.get("weeklyStats", {}).get("sleepHoursPerDay", 7)

    weak_strs = [w["area"] for w in weak_areas if isinstance(w, dict)] if weak_areas else []
    iw = interview_weak_areas or []
    all_weak = list(dict.fromkeys(weak_strs + iw))

    # ── Structured schedule (Phase 5b) ────────────────────────────────────────
    today_str = target_date or date.today().isoformat()
    structured_schedule = _build_structured_schedule(
        target_date=today_str,
        all_weak=all_weak,
        missing_skills=missing_skills,
        burnout_level=burnout_level,
        placement_pct=placement_pct,
        missed_task_days=missed_task_days,
    )

    # ── Legacy text plan (backward compatible) ────────────────────────────────
    daily: list[str] = []
    if dsa < 150:
        daily.append("🧠 Solve 2 LeetCode problems (focus: Arrays / Trees / DP)")
    else:
        daily.append("🧠 Solve 1 LeetCode hard problem or mock interview")
    if coding_hrs / 7 < 3:
        daily.append("💻 Code for at least 3 hours on your active project")
    else:
        daily.append("💻 Continue project work — commit at least 1 meaningful change")
    if burnout_level in ("high", "critical"):
        daily.append("😴 Sleep 7-8 hours — take a 30-min break every 90 minutes")
        daily.append("🧘 10-min mindfulness or walk after work hours")
    elif sleep_hrs < 7:
        daily.append("😴 Aim for 7 hours of sleep tonight")
    if missing_skills:
        daily.append(f"📚 Spend 45 min learning: {missing_skills[0]}")
    daily.append("📝 Review yesterday's notes / code review")

    weekly: list[str] = []
    if placement_pct < 50:
        weekly.append("🎯 Complete 1 mock interview (Pramp / Interviewing.io)")
        weekly.append("📄 Update resume with latest project details")
    else:
        weekly.append("🎯 Apply to 3-5 target companies")
    if backlog_pct > 30:
        weekly.append("📖 Dedicate 2 extra hours to weak academic subjects")
    for skill in missing_skills[:2]:
        weekly.append(f"🛠 Complete 1 tutorial / mini-project in: {skill}")
    for w in [w for w in weak_areas if isinstance(w, dict) and w.get("severity") == "critical"][:2]:
        weekly.append(f"⚠️  Address: {w['area']} — {w['action']}")
    weekly.append("🔄 Review weekly progress and update your Guardian AI profile")

    monthly: list[str] = []
    if ctx.user_profile.projectCount < 2:
        monthly.append("🚀 Complete and deploy a new full-stack project to GitHub + Vercel")
    for skill in missing_skills[:3]:
        monthly.append(f"📗 Gain hands-on proficiency in: {skill}")
    monthly.append("🧪 Attempt 50 LeetCode problems this month across different topics")
    monthly.append("📊 Re-run Guardian AI predictions — track your probability improvement")
    if placement_pct < 60:
        monthly.append("🏢 Register on Internshala / LinkedIn / HackerEarth for upcoming drives")
    monthly.append("🤝 Do at least 2 mock interviews and review feedback")

    ctx.plan = {
        "daily": daily,
        "weekly": weekly,
        "monthly": monthly,
        "priorityFocus": (
            "Burnout Recovery" if burnout_level in ("high", "critical") else
            "Academic Recovery" if backlog_pct > 40 else
            "Placement Readiness" if placement_pct < 50 else
            "Skill Development"
        ),
        "estimatedWeeksToImprove": max(4, int((80 - placement_pct) / 5)),
        "structuredSchedule": structured_schedule,
    }
    return ctx
