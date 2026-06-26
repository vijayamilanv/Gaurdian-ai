"""
Tests for the 5-agent pipeline and individual predict functions.
Run with: pytest tests/ -v
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from main import app
from models.schemas import PipelineContext, UserProfile, Activity
from agents.analyzer import analyzer_agent
from agents.predictor import predict_placement, predict_backlog, predict_burnout, predict_project_failure
from agents.career_mentor import career_mentor_agent
from agents.critic import critic_agent
from agents.planner import planner_agent
from pipeline import run_pipeline

client = TestClient(app)

# ── Fixtures ──────────────────────────────────────────────────────────────────

STRONG_PROFILE = UserProfile(
    cgpa=8.5, attendance=90, dsaSolved=250,
    skillCount=8, skills=["Python", "React", "Node.js", "SQL", "Docker", "AWS", "Git", "Linux"],
    projectCount=3, targetRoles=["Software Engineer"],
)

WEAK_PROFILE = UserProfile(
    cgpa=5.5, attendance=55, dsaSolved=20,
    skillCount=2, skills=["HTML", "CSS"],
    projectCount=0, targetRoles=["Full Stack Developer"],
)

ACTIVITIES = [
    Activity(type="coding", hours=3.0, date="2024-01-01"),
    Activity(type="study",  hours=2.0, date="2024-01-01"),
    Activity(type="sleep",  hours=7.0, date="2024-01-01"),
    Activity(type="coding", hours=4.0, date="2024-01-02"),
    Activity(type="study",  hours=1.5, date="2024-01-02"),
    Activity(type="sleep",  hours=6.5, date="2024-01-02"),
]

# ── Predictor unit tests ──────────────────────────────────────────────────────

def test_placement_strong_profile():
    prob, risks = predict_placement(8.5, 250, 3, 8, 90)
    assert prob > 0.7, "Strong profile should have >70% placement probability"
    assert isinstance(risks, list)

def test_placement_weak_profile():
    prob, risks = predict_placement(5.5, 20, 0, 2, 55)
    assert prob < 0.4, "Weak profile should have <40% placement probability"
    assert len(risks) > 0, "Should identify risks for weak profile"

def test_burnout_high():
    score, risks = predict_burnout(work_hrs=6, coding_hrs=8, sleep_hrs=4, deadline_density=0.9)
    assert score > 0.6, "High work + low sleep should be high burnout"

def test_burnout_low():
    score, risks = predict_burnout(work_hrs=2, coding_hrs=3, sleep_hrs=8, deadline_density=0.2)
    assert score < 0.3, "Low work + good sleep should be low burnout"

def test_backlog_high_risk():
    prob, risks = predict_backlog(cgpa=5.0, attendance=50, study_hours_week=2)
    assert prob > 0.6

def test_probability_bounds():
    """All probabilities must stay within [0.0, 1.0]"""
    for cgpa in [0, 5.5, 7.0, 9.5, 10]:
        prob, _ = predict_placement(cgpa, 100, 2, 5, 75)
        assert 0.0 <= prob <= 1.0

# ── Pipeline integration tests ────────────────────────────────────────────────

def test_full_pipeline_strong():
    ctx = PipelineContext(user_profile=STRONG_PROFILE, activities=ACTIVITIES)
    result = run_pipeline(ctx)
    assert result.current_status is not None
    assert result.predictions is not None
    assert result.skill_gap is not None
    assert result.weaknesses is not None
    assert result.plan is not None

    assert "placement" in result.predictions
    assert result.predictions["placement"]["percentage"] > 60

def test_full_pipeline_weak():
    ctx = PipelineContext(user_profile=WEAK_PROFILE, activities=[])
    result = run_pipeline(ctx)
    assert result.weaknesses["criticalCount"] > 0
    assert result.predictions["placement"]["percentage"] < 40

def test_plan_has_all_timeframes():
    ctx = PipelineContext(user_profile=STRONG_PROFILE, activities=ACTIVITIES)
    result = run_pipeline(ctx)
    assert len(result.plan["daily"]) > 0
    assert len(result.plan["weekly"]) > 0
    assert len(result.plan["monthly"]) > 0

# ── API contract tests ────────────────────────────────────────────────────────

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_agents_run_endpoint():
    payload = {
        "user_profile": {
            "cgpa": 7.5, "attendance": 80, "dsaSolved": 120,
            "skillCount": 5, "skills": ["Python", "React", "SQL", "Git", "Docker"],
            "projectCount": 2, "targetRoles": ["Software Engineer"],
        },
        "activities": [
            {"type": "coding", "hours": 3.0, "date": "2024-01-01"},
            {"type": "sleep",  "hours": 7.0, "date": "2024-01-01"},
        ],
    }
    response = client.post("/agents/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "predictions" in data
    assert "skill_gap" in data
    assert "plan" in data

def test_predict_placement_endpoint():
    response = client.post("/predict/placement", json={
        "cgpa": 7.2, "dsaSolved": 45, "projects": 2,
        "skills": ["Java", "React", "Node.js"], "attendance": 70,
    })
    assert response.status_code == 200
    data = response.json()
    assert "probability" in data
    assert "topRisks" in data
    assert 0.0 <= data["probability"] <= 1.0

def test_skill_gap_endpoint():
    response = client.post("/skills/gap", json={
        "skills": ["Python", "React"],
        "targetRoles": ["Full Stack Developer"],
    })
    assert response.status_code == 200
    data = response.json()
    assert "missingSkills" in data
    assert "coveragePercent" in data
    assert data["coveragePercent"] < 100
