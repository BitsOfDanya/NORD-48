"""Cost/resource estimation — pure arithmetic, no scenario simulation.

See `app.calculation.economics.cost_model` for why every field defaults to
"off": no built-in price is ever assumed.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.calculation.economics.cost_model import (
    CostAssumptions,
    cost_per_availability_point,
    estimate_cost,
    resource_summary,
)

router = APIRouter(tags=["economics"])


class EstimateRequest(BaseModel):
    satellite_count: int = Field(ge=1)
    total_satellites: int = Field(ge=1)
    launch_batches_used: int = Field(default=1, ge=1)
    worst_availability_percent: float | None = Field(default=None, ge=0, le=100)
    satellite_unit_cost_rub: float | None = Field(default=None, ge=0)
    launch_fixed_cost_rub: float | None = Field(default=None, ge=0)
    launch_capacity_satellites: int | None = Field(default=None, ge=1)
    integration_cost_rub: float = Field(default=0.0, ge=0)
    reserve_percent: float = Field(default=0.0, ge=0)
    source_label: str | None = None


@router.post("/estimate")
async def estimate(payload: EstimateRequest) -> dict[str, Any]:
    resources = resource_summary(
        payload.satellite_count,
        payload.total_satellites,
        launch_batches_used=payload.launch_batches_used,
        launch_capacity_satellites=payload.launch_capacity_satellites,
    )
    assumptions = CostAssumptions(
        satellite_unit_cost_rub=payload.satellite_unit_cost_rub,
        launch_fixed_cost_rub=payload.launch_fixed_cost_rub,
        launch_capacity_satellites=payload.launch_capacity_satellites,
        integration_cost_rub=payload.integration_cost_rub,
        reserve_percent=payload.reserve_percent,
        source_label=payload.source_label,
    )
    cost = estimate_cost(payload.satellite_count, assumptions)

    result: dict[str, Any] = {
        "mode": "cost" if cost is not None else "resource_only",
        "resources": {
            "satellite_count": resources.satellite_count,
            "total_satellites": resources.total_satellites,
            "launch_batches_used": resources.launch_batches_used,
            "estimated_launches": resources.estimated_launches,
        },
        "cost": None,
        "cost_per_availability_point_rub": None,
    }
    if cost is not None:
        result["cost"] = {
            "satellite_count": cost.satellite_count,
            "estimated_satellite_cost_rub": cost.estimated_satellite_cost_rub,
            "estimated_launches": cost.estimated_launches,
            "estimated_launch_cost_rub": cost.estimated_launch_cost_rub,
            "integration_cost_rub": cost.integration_cost_rub,
            "reserve_percent": cost.reserve_percent,
            "estimated_total_rub": cost.estimated_total_rub,
            "source_label": cost.source_label,
        }
        if payload.worst_availability_percent is not None:
            result["cost_per_availability_point_rub"] = cost_per_availability_point(
                cost, payload.worst_availability_percent
            )
    return result
