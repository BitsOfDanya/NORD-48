"""Compare two to ten completed exact simulation runs.

Errors (`SimulationNotFoundError`) are translated to HTTP responses by the
global handlers in `app.main`.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas.comparison import CompareRunsRequest
from app.services import comparison_service

router = APIRouter(tags=["comparisons"])


@router.post("")
def compare_runs(payload: CompareRunsRequest) -> dict[str, Any]:
    try:
        return comparison_service.compare_runs(payload.run_ids, payload.baseline_run_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
