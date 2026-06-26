"""Sequential pipeline orchestrator — runs all 5 agents in order.
Sub-Phase D: application tracking signals forwarded from request to predictor_agent.
"""
from __future__ import annotations
from models.schemas import PipelineContext, PipelineRequest
from agents.analyzer import analyzer_agent
from agents.predictor import predictor_agent
from agents.career_mentor import career_mentor_agent
from agents.critic import critic_agent
from agents.planner import planner_agent


def run_pipeline(ctx: PipelineContext, req: PipelineRequest | None = None) -> PipelineContext:
    """Run the full 5-agent pipeline sequentially.
    Each agent reads from and writes to the shared context object.
    """
    ctx = analyzer_agent(ctx)
    # Forward optional application signals if supplied in the original request
    if req is not None:
        ctx = predictor_agent(
            ctx,
            active_apps=req.active_apps,
            rounds_completed=req.rounds_completed,
            round_pass_rate=req.round_pass_rate,
            days_since_last_app=req.days_since_last_app,
        )
    else:
        ctx = predictor_agent(ctx)
    ctx = career_mentor_agent(ctx)
    ctx = critic_agent(ctx)
    ctx = planner_agent(ctx)
    return ctx
