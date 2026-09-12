"""Compare two to ten completed exact simulation runs.

Errors (`SimulationNotFoundError`) are translated to HTTP responses by the
global handlers in `app.main`.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException

from app.calculation.optimization.robust_explainability import (
    compute_recovery_stats,
    dominant_recovery_reason,
    find_transition_example,
    recovery_summary,
)
from app.schemas.comparison import CompareRunsRequest, RecoveryComparisonRequest
from app.services import comparison_service, simulation_service

router = APIRouter(tags=["comparisons"])


@router.post("")
def compare_runs(payload: CompareRunsRequest) -> dict[str, Any]:
    try:
        return comparison_service.compare_runs(payload.run_ids, payload.baseline_run_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/recovery")
def compare_recovery(payload: RecoveryComparisonRequest) -> dict[str, Any]:
    """Baseline-vs-candidate recovered/lost connectivity under the SAME
    stress scenario, reusing the two runs' already-computed timelines
    (see `app.calculation.optimization.robust_explainability`). Both runs
    must come from `/simulations/run` first — this endpoint does no new
    simulation, only a diff."""
    baseline_run = simulation_service.get_run(payload.baseline_run_id)
    candidate_run = simulation_service.get_run(payload.candidate_run_id)
    if baseline_run.step_s != candidate_run.step_s or sorted(baseline_run.client_ids) != sorted(
        candidate_run.client_ids
    ):
        raise HTTPException(
            status_code=422,
            detail="baseline and candidate runs must share step_s and the client set to compare recovery",
        )
    stats = compute_recovery_stats(baseline_run.timeline, candidate_run.timeline, baseline_run.step_s)
    return {
        "per_client": {client_id: asdict(client_stats) for client_id, client_stats in stats.items()},
        "summary": recovery_summary(stats),
        "dominant_recovery_reason": dominant_recovery_reason(stats),
        "recovered_example": find_transition_example(
            baseline_run.timeline, candidate_run.timeline, recovered=True
        ),
        "lost_example": find_transition_example(
            baseline_run.timeline, candidate_run.timeline, recovered=False
        ),
    }
