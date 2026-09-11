"""Asynchronous exact orbital-configuration optimization API."""

from __future__ import annotations

import csv
import io
import json
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field, field_validator, model_validator

from app.calculation.optimization.configuration import plane_parameters
from app.services import optimization_service, scenario_service

router = APIRouter(tags=["optimization"])

AnalysisStrategy = Literal[
    "minimum_hops", "minimum_distance", "maximum_margin", "maximum_persistence"
]


class Bound(BaseModel):
    minimum: float = 0.0
    maximum: float = 360.0

    @field_validator("minimum")
    @classmethod
    def valid_minimum(cls, value: float) -> float:
        if value < 0 or value >= 360:
            raise ValueError("minimum must be in [0, 360)")
        return value

    @field_validator("maximum")
    @classmethod
    def valid_maximum(cls, value: float) -> float:
        if value <= 0 or value > 360:
            raise ValueError("maximum must be in (0, 360]")
        return value


class OptimizationRequest(BaseModel):
    scenario_id: str = "01_full_constellation"
    mode: Literal["normal", "robust"] = "normal"
    stress_profile_ids: list[str] = Field(
        default_factory=lambda: [
            "01_full_constellation",
            "03_satellite_outages",
            "04_link_range",
        ]
    )
    variable_parameters: list[str] = Field(
        default_factory=lambda: [
            "P2.raan_deg",
            "P3.raan_deg",
            "P2.phase_deg",
            "P3.phase_deg",
        ]
    )
    bounds: dict[str, Bound] = Field(default_factory=dict)
    routing_strategy: AnalysisStrategy = "minimum_hops"
    budget: int = Field(default=100, ge=1, le=500)
    seed: int = 42
    algorithm: Literal["random", "differential_evolution"] = "differential_evolution"
    initial_exploration_size: int = Field(default=16, ge=0, le=100)
    stop_on_target: bool = False
    polish: bool = False

    @model_validator(mode="after")
    def valid_selection(self) -> OptimizationRequest:
        if len(self.variable_parameters) != len(set(self.variable_parameters)):
            raise ValueError("variable_parameters must be unique")
        if self.mode == "robust" and not self.stress_profile_ids:
            raise ValueError("robust mode requires stress profiles")
        return self


@router.post("/run", status_code=202)
async def create_optimization(payload: OptimizationRequest) -> dict[str, Any]:
    base = scenario_service.get_example(payload.scenario_id)
    baseline = plane_parameters(base)
    unknown = sorted(set(payload.variable_parameters) - set(baseline))
    if unknown or not payload.variable_parameters:
        detail = f"unknown parameters: {', '.join(unknown)}" if unknown else "no variables"
        raise HTTPException(status_code=422, detail=detail)
    scenarios = (
        {payload.scenario_id: base}
        if payload.mode == "normal"
        else {
            scenario_id: scenario_service.get_example(scenario_id)
            for scenario_id in payload.stress_profile_ids
        }
    )
    bounds = {
        name: (
            payload.bounds.get(name, Bound()).minimum,
            payload.bounds.get(name, Bound()).maximum,
        )
        for name in payload.variable_parameters
    }
    if any(low >= high for low, high in bounds.values()):
        raise HTTPException(status_code=422, detail="each bound must satisfy minimum < maximum")
    run_id = optimization_service.create_job(
        {
            "scenarios": scenarios,
            "variable_names": payload.variable_parameters,
            "bounds": bounds,
            "routing_strategy": payload.routing_strategy,
            "budget": payload.budget,
            "seed": payload.seed,
            "algorithm": payload.algorithm,
            "initial_exploration_size": payload.initial_exploration_size,
            "stop_on_target": payload.stop_on_target,
            "polish": payload.polish,
        }
    )
    return {
        "run_id": run_id,
        "status": "queued",
        "budget": payload.budget,
        "evaluated": 0,
        "best_worst_availability": None,
    }


@router.get("/{run_id}")
async def optimization_status(run_id: str) -> dict[str, Any]:
    job = optimization_service.get_job(run_id)
    if job is None:
        raise HTTPException(status_code=404, detail="optimization run not found")
    job.pop("result", None)
    return job


@router.get("/{run_id}/result")
async def optimization_result(run_id: str) -> dict[str, Any]:
    job = optimization_service.get_job(run_id)
    if job is None:
        raise HTTPException(status_code=404, detail="optimization run not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"optimization is {job['status']}")
    return job["result"]


def _dataset_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for candidate in result["dataset"]:
        for scenario in candidate["scenarios"]:
            rows.append(
                {
                    **candidate["parameters"],
                    "evaluation": candidate.get("evaluation"),
                    "scenario_id": scenario["scenario_id"],
                    "isl_range_km": scenario["isl_range_km"],
                    "failure_count": scenario["failure_count"],
                    "worst_availability": scenario["worst_availability"],
                    "mean_availability": candidate["aggregates"]["mean_availability"],
                    "max_outage_s": candidate["aggregates"]["worst_max_outage_s"],
                    "robust_worst_availability": candidate["aggregates"]["worst_availability"],
                }
            )
    return rows


@router.get("/{run_id}/dataset")
async def optimization_dataset(
    run_id: str, format: Literal["jsonl", "csv"] = "jsonl"
) -> Response:
    job = optimization_service.get_job(run_id)
    if job is None:
        raise HTTPException(status_code=404, detail="optimization run not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"optimization is {job['status']}")
    rows = _dataset_rows(job["result"])
    if format == "jsonl":
        body = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n"
        return Response(body, media_type="application/x-ndjson")
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0]) if rows else [])
    writer.writeheader()
    writer.writerows(rows)
    return Response(output.getvalue(), media_type="text/csv")
