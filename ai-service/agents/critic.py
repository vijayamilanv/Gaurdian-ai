"""Agent 4 — Critic
Scores profile completeness and identifies specific weak areas.
Phase 3 will use RAG + Gemini to give resume-specific narrative feedback.
"""
from __future__ import annotations
from models.schemas import PipelineContext


def critic_agent(ctx: PipelineContext) -> PipelineContext:
    p = ctx.user_profile
    predictions = ctx.predictions or {}
    skill_gap = ctx.skill_gap or {}

    weak_areas: list[dict] = []
    profile_score = 100  # start at 100 and deduct

    # ── DSA ───────────────────────────────────────────────────────────────────
    if p.dsaSolved < 50:
        weak_areas.append({
            "area": "DSA Practice",
            "severity": "critical",
            "detail": f"Only {p.dsaSolved} problems solved. Target: 200+ for top companies.",
            "action": "Solve 3 LeetCode problems daily — focus on Arrays, Trees, DP.",
        })
        profile_score -= 25
    elif p.dsaSolved < 150:
        weak_areas.append({
            "area": "DSA Practice",
            "severity": "high",
            "detail": f"{p.dsaSolved} problems solved. Needs improvement for FAANG-level placements.",
            "action": "Solve 5 problems per week, focus on medium-difficulty patterns.",
        })
        profile_score -= 15

    # ── CGPA ──────────────────────────────────────────────────────────────────
    if p.cgpa < 6.5:
        weak_areas.append({
            "area": "Academic Performance",
            "severity": "critical",
            "detail": f"CGPA {p.cgpa} is below most company cut-offs (7.0+).",
            "action": "Prioritise upcoming semester exams. Seek academic support.",
        })
        profile_score -= 20
    elif p.cgpa < 7.5:
        weak_areas.append({
            "area": "Academic Performance",
            "severity": "medium",
            "detail": f"CGPA {p.cgpa} is acceptable but not competitive for top companies.",
            "action": "Aim for 8.0+ in remaining semesters.",
        })
        profile_score -= 10

    # ── Projects ──────────────────────────────────────────────────────────────
    if p.projectCount < 1:
        weak_areas.append({
            "area": "Project Portfolio",
            "severity": "critical",
            "detail": "No projects in portfolio. Recruiters expect at least 2 significant projects.",
            "action": "Build a full-stack project this month and host it on GitHub.",
        })
        profile_score -= 20
    elif p.projectCount < 2:
        weak_areas.append({
            "area": "Project Portfolio",
            "severity": "high",
            "detail": "Only 1 project. Most shortlists expect 2-3 deployed projects.",
            "action": "Start a second project using a different tech stack.",
        })
        profile_score -= 10

    # ── Skills ────────────────────────────────────────────────────────────────
    coverage = skill_gap.get("coveragePercent", 100)
    if coverage < 40:
        weak_areas.append({
            "area": "Skill Coverage",
            "severity": "high",
            "detail": f"Only {coverage}% of required skills for target roles are present.",
            "action": f"Focus on: {', '.join(skill_gap.get('topMissingSkills', [])[:3])}",
        })
        profile_score -= 15
    elif coverage < 60:
        weak_areas.append({
            "area": "Skill Coverage",
            "severity": "medium",
            "detail": f"{coverage}% skill coverage — room to grow.",
            "action": f"Learn: {', '.join(skill_gap.get('topMissingSkills', [])[:2])} next.",
        })
        profile_score -= 8

    # ── Attendance ────────────────────────────────────────────────────────────
    if p.attendance < 60:
        weak_areas.append({
            "area": "Attendance",
            "severity": "critical",
            "detail": f"{p.attendance}% attendance — below minimum required by most colleges.",
            "action": "Improve attendance immediately to avoid exam eligibility issues.",
        })
        profile_score -= 15

    # ── Cloud / System Design (check from missing skills) ─────────────────────
    missing = skill_gap.get("missingSkills", [])
    if "System Design" in missing:
        weak_areas.append({
            "area": "System Design",
            "severity": "high",
            "detail": "System Design not in skill set — mandatory for senior/FAANG interviews.",
            "action": "Study the System Design Primer on GitHub. Practice designing 2 systems/week.",
        })

    ctx.weaknesses = {
        "profileScore": max(profile_score, 0),
        "weakAreas": weak_areas,
        "totalWeaknesses": len(weak_areas),
        "criticalCount": sum(1 for w in weak_areas if w["severity"] == "critical"),
    }
    return ctx
