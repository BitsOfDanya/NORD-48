"""Compare two or more completed exact simulation runs."""

from fastapi import APIRouter, HTTPException

from app.schemas.comparison import CompareRunsRequest
from app.services import comparison_service

router = APIRouter(tags=["comparisons"])


@router.post("")
def compare_runs(payload: CompareRunsRequest) -> dict:
    try:
        return comparison_service.compare_runs(payload.run_ids)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
