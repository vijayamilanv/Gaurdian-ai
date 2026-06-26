"""Agent 2 — Predictor
Rule-based risk models for placement, backlog, burnout, and project failure.
Same API contract as the future ML models — zero changes needed in backend/frontend when upgraded.
"""
from __future__ import annotations
from models.schemas import PipelineContext


def _clamp(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 2)


def predict_placement(
    cgpa: float, dsa: int, projects: int, skills: int, attendance: float,
    # ── Optional application-tracking signals (Sub-Phase D) ───────────────────
    active_apps: int | None = None,           # number of active applications
    rounds_completed: int | None = None,      # total interview rounds done
    round_pass_rate: float | None = None,     # 0-1, fraction of rounds passed
    days_since_last_app: int | None = None,   # days since last application submitted
) -> tuple[float, list[str]]:
    score = (
        (cgpa / 10.0) * 0.35 +
        (min(dsa, 300) / 300.0) * 0.30 +
        (min(projects, 5) / 5.0) * 0.20 +
        (min(skills, 20) / 20.0) * 0.10 +
        (attendance / 100.0) * 0.05
    )

    # ── Application-tracker boost (optional) ─────────────────────────────────
    app_bonus = 0.0
    if active_apps is not None and active_apps > 0:
        # More active applications → higher real-world job-seeking momentum
        app_bonus += min(active_apps, 10) / 10.0 * 0.08
    if rounds_completed is not None and rounds_completed > 0:
        # Actual rounds = real interview experience
        app_bonus += min(rounds_completed, 20) / 20.0 * 0.06
    if round_pass_rate is not None:
        # Higher pass rate → stronger signal
        app_bonus += round_pass_rate * 0.06
    # Penalise stale job search (no application in 30+ days)
    if days_since_last_app is not None and days_since_last_app > 30:
        app_bonus -= 0.04

    score = _clamp(score + app_bonus)

    risks = []
    if cgpa < 7.0:        risks.append("Low CGPA (below 7.0)")
    if dsa < 100:         risks.append("Low DSA practice (< 100 problems)")
    if dsa < 200:         risks.append("DSA breadth needs improvement")
    if projects < 2:      risks.append("Few projects in portfolio")
    if skills < 5:        risks.append("Limited technical skill set")
    if attendance < 75:   risks.append("Low attendance record")
    # Application-tracker risk signals
    if active_apps is not None and active_apps == 0:
        risks.append("No active job applications")
    if days_since_last_app is not None and days_since_last_app > 30:
        risks.append(f"No application submitted in {days_since_last_app} days")
    if round_pass_rate is not None and round_pass_rate < 0.4:
        risks.append(f"Interview round pass rate low ({round_pass_rate:.0%})")
    return score, risks[:5]


def predict_backlog(cgpa: float, attendance: float,
                    study_hours_week: float) -> tuple[float, list[str]]:
    risk = 0.0
    if cgpa < 6.0:             risk += 0.40
    elif cgpa < 7.0:           risk += 0.25
    elif cgpa < 8.0:           risk += 0.10
    if attendance < 60:        risk += 0.35
    elif attendance < 75:      risk += 0.20
    if study_hours_week < 5:   risk += 0.25
    elif study_hours_week < 10: risk += 0.10

    risks = []
    if cgpa < 7.0:            risks.append("CGPA below safe threshold")
    if attendance < 75:       risks.append("Attendance below 75%")
    if study_hours_week < 10: risks.append("Insufficient weekly study hours")
    return _clamp(risk), risks[:4]


def predict_burnout(work_hrs: float, coding_hrs: float,
                    sleep_hrs: float, deadline_density: float) -> tuple[float, list[str]]:
    score = 0.0
    daily_active = work_hrs + coding_hrs
    if daily_active > 12:      score += 0.40
    elif daily_active > 9:     score += 0.25
    elif daily_active > 7:     score += 0.10
    if sleep_hrs < 5:          score += 0.35
    elif sleep_hrs < 6:        score += 0.20
    elif sleep_hrs < 7:        score += 0.10
    score += deadline_density * 0.25

    risks = []
    if daily_active > 9:      risks.append("Excessive daily work hours")
    if sleep_hrs < 7:         risks.append("Insufficient sleep")
    if deadline_density > 0.6: risks.append("High deadline density")
    if coding_hrs > 8:        risks.append("Coding hours unsustainable")
    return _clamp(score), risks[:4]


def predict_project_failure(project_count: int, coding_hrs: float,
                             cgpa: float) -> tuple[float, list[str]]:
    risk = 0.0
    if project_count == 0: risk += 0.50
    elif project_count < 2: risk += 0.25
    if coding_hrs < 2:     risk += 0.30
    elif coding_hrs < 4:   risk += 0.15
    if cgpa < 6.5:         risk += 0.20

    risks = []
    if project_count < 2:  risks.append("Too few projects")
    if coding_hrs < 4:     risks.append("Low daily coding practice")
    if cgpa < 7.0:         risks.append("Low academic performance")
    return _clamp(risk), risks[:4]


def predictor_agent(
    ctx: PipelineContext,
    # ── Optional application-tracker signals (Sub-Phase D) ──────────────────
    active_apps: int | None = None,
    rounds_completed: int | None = None,
    round_pass_rate: float | None = None,
    days_since_last_app: int | None = None,
) -> PipelineContext:
    p = ctx.user_profile
    status = ctx.current_status or {}
    weekly = status.get("weeklyStats", {})

    study_weekly  = weekly.get("studyHours", 0)
    coding_daily  = weekly.get("codingHours", 0) / 7
    sleep_daily   = weekly.get("sleepHoursPerDay", 7)
    work_daily    = weekly.get("workHoursPerDay", 0)

    p_prob, p_risks = predict_placement(
        p.cgpa, p.dsaSolved, p.projectCount, p.skillCount, p.attendance,
        active_apps=active_apps,
        rounds_completed=rounds_completed,
        round_pass_rate=round_pass_rate,
        days_since_last_app=days_since_last_app,
    )
    b_prob,   b_risks  = predict_backlog(p.cgpa, p.attendance, study_weekly)
    bu_score, bu_risks = predict_burnout(work_daily, coding_daily, sleep_daily, 0.5)
    pf_prob,  pf_risks = predict_project_failure(p.projectCount, coding_daily, p.cgpa)

    ctx.predictions = {
        "placement": {
            "probability": p_prob,
            "percentage": round(p_prob * 100, 1),
            "topRisks": p_risks,
        },
        "backlog": {
            "probability": b_prob,
            "percentage": round(b_prob * 100, 1),
            "topRisks": b_risks,
        },
        "burnout": {
            "score": round(bu_score * 100, 1),
            "level": (
                "critical" if bu_score > 0.75 else
                "high"     if bu_score > 0.50 else
                "medium"   if bu_score > 0.25 else "low"
            ),
            "topRisks": bu_risks,
        },
        "projectFailure": {
            "probability": pf_prob,
            "percentage": round(pf_prob * 100, 1),
            "topRisks": pf_risks,
        },
    }
    return ctx
