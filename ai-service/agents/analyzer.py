"""Agent 1 — Analyzer
Reads user profile + recent activities and computes a structured current-status summary.
No LLM calls; pure aggregation math.
"""
from __future__ import annotations
from collections import defaultdict
from models.schemas import PipelineContext


def analyzer_agent(ctx: PipelineContext) -> PipelineContext:
    profile = ctx.user_profile
    activities = ctx.activities

    # ── Aggregate last-7-days activity by type ────────────────────────────────
    hours_by_type: dict[str, float] = defaultdict(float)
    for act in activities:
        hours_by_type[act.type] += act.hours

    total_days = max(len(set(a.date for a in activities)), 1)
    days = min(total_days, 7)

    study_weekly   = round(hours_by_type.get("study", 0), 1)
    coding_weekly  = round(hours_by_type.get("coding", 0), 1)
    sleep_daily    = round(hours_by_type.get("sleep", 0) / days, 1)
    work_daily     = round((hours_by_type.get("work", 0) + coding_weekly) / days, 1)

    # ── Activity grade ────────────────────────────────────────────────────────
    activity_score = 0
    if study_weekly >= 10:  activity_score += 25
    elif study_weekly >= 5: activity_score += 15
    if coding_weekly >= 14: activity_score += 25
    elif coding_weekly >= 7: activity_score += 15
    if sleep_daily >= 7:    activity_score += 25
    elif sleep_daily >= 6:  activity_score += 15
    if profile.attendance >= 75: activity_score += 25
    elif profile.attendance >= 60: activity_score += 15

    grade = (
        "Excellent" if activity_score >= 90 else
        "Good"      if activity_score >= 70 else
        "Average"   if activity_score >= 50 else
        "Poor"
    )

    # ── Overall readiness score (0-100) ──────────────────────────────────────
    readiness = round(
        (profile.cgpa / 10.0) * 30 +
        (min(profile.dsaSolved, 300) / 300.0) * 25 +
        (min(profile.projectCount, 5) / 5.0) * 20 +
        (min(profile.skillCount, 20) / 20.0) * 15 +
        (profile.attendance / 100.0) * 10,
        1,
    )

    ctx.current_status = {
        "overallReadiness": readiness,
        "activityGrade": grade,
        "activityScore": activity_score,
        "weeklyStats": {
            "studyHours": study_weekly,
            "codingHours": coding_weekly,
            "sleepHoursPerDay": sleep_daily,
            "workHoursPerDay": work_daily,
        },
        "profileStats": {
            "cgpa": profile.cgpa,
            "dsaSolved": profile.dsaSolved,
            "projectCount": profile.projectCount,
            "skillCount": profile.skillCount,
            "attendance": profile.attendance,
        },
    }

    return ctx
