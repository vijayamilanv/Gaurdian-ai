from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


# ── Input models ─────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    cgpa: float = 0.0
    attendance: float = 0.0
    dsaSolved: int = 0
    skillCount: int = 0
    skills: list[str] = []
    projectCount: int = 0
    targetRoles: list[str] = []
    # Optional fields used by planner / schedule agents
    name: str = "user"
    recentActivities: list[dict] = []
    weeklyGoals: dict = {}
    # Sub-Phase D: application tracking signals
    activeApps: int | None = None
    roundsCompleted: int | None = None
    roundPassRate: float | None = None
    daysSinceLastApp: int | None = None


class Activity(BaseModel):
    type: str          # "study" | "coding" | "sleep" | "work"
    hours: float
    date: str          # ISO date string


# ── Pipeline context ─────────────────────────────────────────────────────────

class PipelineContext(BaseModel):
    user_profile: UserProfile
    activities: list[Activity] = []
    current_status: Optional[dict] = None   # filled by Analyzer
    predictions: Optional[dict] = None       # filled by Predictor
    skill_gap: Optional[dict] = None         # filled by Career Mentor
    weaknesses: Optional[dict] = None        # filled by Critic
    plan: Optional[dict] = None              # filled by Planner


# ── API request / response schemas ───────────────────────────────────────────

class PipelineRequest(BaseModel):
    user_profile: UserProfile
    activities: list[Activity] = []
    # Sub-Phase D: application signals (optional, forwarded to predictor_agent)
    active_apps: int | None = None
    rounds_completed: int | None = None
    round_pass_rate: float | None = None
    days_since_last_app: int | None = None


class PlacementRequest(BaseModel):
    cgpa: float
    dsaSolved: int
    projects: int
    skills: list[str]
    attendance: float


class PlacementResponse(BaseModel):
    probability: float
    topRisks: list[str]


class BacklogRequest(BaseModel):
    cgpa: float
    attendance: float
    studyHoursPerWeek: float = 0.0


class BacklogResponse(BaseModel):
    probability: float
    topRisks: list[str]


class BurnoutRequest(BaseModel):
    workHoursPerDay: float
    codingHoursPerDay: float
    sleepHoursPerDay: float
    deadlineDensity: float = 0.5   # 0-1 scale


class BurnoutResponse(BaseModel):
    score: float          # 0-100
    level: str            # "low" | "medium" | "high" | "critical"
    topRisks: list[str]


class ProjectFailureRequest(BaseModel):
    projectCount: int
    codingHoursPerDay: float
    cgpa: float


class ProjectFailureResponse(BaseModel):
    probability: float
    topRisks: list[str]


class SkillGapRequest(BaseModel):
    skills: list[str]
    targetRoles: list[str]


class SkillGapResponse(BaseModel):
    missingSkills: list[str]
    presentSkills: list[str]
    coveragePercent: float
    recommendedResources: dict[str, str]
