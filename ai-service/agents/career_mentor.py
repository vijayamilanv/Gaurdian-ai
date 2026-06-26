"""Agent 3 — Career Mentor
Computes skill gap between user skills and market requirements per target role.
Uses static market_skills.json reference table (Phase 2).
Phase 3 will ground output in ChromaDB + Gemini narrative.
"""
from __future__ import annotations
import json
import os
from models.schemas import PipelineContext

_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "market_skills.json")

with open(_DATA_PATH, "r") as f:
    MARKET_SKILLS: dict[str, list[str]] = json.load(f)

# Curated learning resources per skill
RESOURCES: dict[str, str] = {
    "Data Structures":     "https://leetcode.com/explore/",
    "Algorithms":          "https://leetcode.com/explore/",
    "System Design":       "https://github.com/donnemartin/system-design-primer",
    "Docker":              "https://docs.docker.com/get-started/",
    "AWS":                 "https://aws.amazon.com/training/",
    "Kubernetes":          "https://kubernetes.io/docs/tutorials/",
    "React":               "https://react.dev/learn",
    "TypeScript":          "https://www.typescriptlang.org/docs/",
    "Node.js":             "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs",
    "Python":              "https://docs.python.org/3/tutorial/",
    "Machine Learning":    "https://www.coursera.org/learn/machine-learning",
    "Deep Learning":       "https://www.deeplearning.ai/",
    "SQL":                 "https://sqlzoo.net/",
    "PostgreSQL":          "https://www.postgresql.org/docs/current/tutorial.html",
    "Git":                 "https://learngitbranching.js.org/",
    "Linux":               "https://linuxjourney.com/",
    "CI/CD":               "https://docs.github.com/en/actions",
    "Terraform":           "https://developer.hashicorp.com/terraform/tutorials",
    "Kafka":               "https://kafka.apache.org/quickstart",
    "REST APIs":           "https://restfulapi.net/",
}


def career_mentor_agent(ctx: PipelineContext) -> PipelineContext:
    user_skills_lower = {s.lower() for s in ctx.user_profile.skills}
    target_roles = ctx.user_profile.targetRoles or ["Software Engineer"]

    # Aggregate required skills across all target roles
    required: set[str] = set()
    for role in target_roles:
        # Fuzzy match role name
        matched = next(
            (k for k in MARKET_SKILLS if k.lower() in role.lower() or role.lower() in k.lower()),
            "Software Engineer",
        )
        required.update(MARKET_SKILLS[matched])

    # Compute present vs missing
    present  = [s for s in required if s.lower() in user_skills_lower]
    missing  = [s for s in required if s.lower() not in user_skills_lower]
    coverage = round(len(present) / max(len(required), 1) * 100, 1)

    # Prioritise missing skills that have known resources
    prioritised = sorted(missing, key=lambda s: 0 if s in RESOURCES else 1)

    recommended = {s: RESOURCES.get(s, "https://google.com/search?q=" + s.replace(" ", "+"))
                   for s in prioritised[:8]}

    ctx.skill_gap = {
        "targetRoles": target_roles,
        "requiredSkills": list(required),
        "presentSkills": present,
        "missingSkills": prioritised,
        "coveragePercent": coverage,
        "recommendedResources": recommended,
        "topMissingSkills": prioritised[:5],
    }
    return ctx
