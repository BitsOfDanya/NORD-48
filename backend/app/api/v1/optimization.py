"""Exact RAAN/phase optimization endpoints."""

from fastapi import APIRouter, HTTPException

from app.schemas.optimization import OptimizationRequest
from app.services import optimization_service

router = APIRouter(tags=["optimization"])


@router.post("/run")
def run_optimization(payload: OptimizationRequest) -> dict:
    try:
        return optimization_service.optimize_request(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
