"""Simulation endpoints: run, inspect, and export simulation runs.

Errors (`ScenarioNotFoundError`, `SimulationNotFoundError`,
`InvalidScenarioError`) are translated to HTTP responses by the global
handlers in `app.main`.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.models.route import RouteRecord
from app.models.simulation import SimulationRun
from app.services import scenario_service, simulation_service

router = APIRouter(tags=["simulations"])

RoutingStrategy = Literal[
    "minimum_hops", "minimum_distance", "maximum_margin", "maximum_persistence"
]


class RunSimulationRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    routing_strategy: RoutingStrategy = "minimum_hops"


def _route_record_dict(record: RouteRecord) -> dict[str, Any]:
    return {
        "t_s": record.t_s,
        "client_id": record.client_id,
        "gateway_id": record.gateway_id,
        "strategy": record.strategy,
        "path": record.path,
        "hops": record.hops,
        "total_distance_km": record.total_distance_km,
        "bottleneck_margin": record.bottleneck_margin,
        "bottleneck_edge": list(record.bottleneck_edge) if record.bottleneck_edge else None,
        "route_lifetime_steps": record.route_lifetime_steps,
        "route_lifetime_s": record.route_lifetime_s,
        "route_valid_until_s": record.route_valid_until_s,
        "persistence_horizon_s": record.persistence_horizon_s,
        "visible": record.visible,
        "available": record.available,
        "diagnostic_reason": record.diagnostic_reason,
        "diagnostic_checks": record.diagnostic_checks,
    }


def _metrics_dict(client_id: str, run: SimulationRun) -> dict[str, Any]:
    m = run.metrics[client_id]
    return {
        "client_id": m.client_id,
        "visibility_fraction": m.visibility_fraction,
        "visibility_percent": m.visibility_percent,
        "availability_fraction": m.availability_fraction,
        "availability_percent": m.availability_percent,
        "target_availability": m.target_availability,
        "target_achieved": m.target_achieved,
        "max_outage_s": m.max_outage_s,
        "outage_count": m.outage_count,
        "average_hops": m.average_hops,
        "route_change_count": m.route_change_count,
        "average_route_distance_km": m.average_route_distance_km,
    }


def _run_summary(run: SimulationRun) -> dict[str, Any]:
    return {
        "run_id": run.run_id,
        "scenario_id": run.scenario.get("meta", {}).get("id"),
        "scenario_title": run.scenario.get("meta", {}).get("title"),
        "routing_strategy": run.routing_strategy,
        "step_s": run.step_s,
        "horizon_s": run.horizon_s,
        "n_steps": run.n_steps,
        "client_ids": run.client_ids,
        "gateway_ids": run.gateway_ids,
        "created_at": run.created_at,
        "metrics": {cid: _metrics_dict(cid, run) for cid in run.client_ids},
    }


def _require_client(run: SimulationRun, client_id: str) -> None:
    if client_id not in run.client_ids:
        raise HTTPException(status_code=404, detail=f"Unknown client_id: {client_id}")


def _require_t_s(run: SimulationRun, t_s: float) -> None:
    if not (0 <= t_s < run.horizon_s):
        raise HTTPException(
            status_code=422, detail=f"t_s must be in [0, {run.horizon_s})"
        )


@router.post("/run")
async def run_simulation(payload: RunSimulationRequest) -> dict[str, Any]:
    if payload.scenario_id:
        scenario = scenario_service.get_example(payload.scenario_id)
    elif payload.scenario:
        scenario = scenario_service.parse_and_validate(payload.scenario)
    else:
        raise HTTPException(status_code=422, detail="scenario_id or scenario is required")

    run = simulation_service.run_simulation(scenario, payload.routing_strategy)
    return _run_summary(run)


@router.get("/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    return _run_summary(simulation_service.get_run(run_id))


@router.get("/{run_id}/metrics")
async def get_metrics(run_id: str) -> dict[str, Any]:
    run = simulation_service.get_run(run_id)
    return {cid: _metrics_dict(cid, run) for cid in run.client_ids}


@router.get("/{run_id}/snapshot")
async def get_snapshot(run_id: str, t_s: float = Query(..., ge=0)) -> dict[str, Any]:
    run = simulation_service.get_run(run_id)
    _require_t_s(run, t_s)
    view = simulation_service.get_snapshot_view(run, t_s)
    view["routes"] = {cid: _route_record_dict(r) for cid, r in view["routes"].items()}
    return view


@router.get("/{run_id}/route")
async def get_route(
    run_id: str, client_id: str, t_s: float = Query(..., ge=0)
) -> dict[str, Any]:
    run = simulation_service.get_run(run_id)
    _require_client(run, client_id)
    _require_t_s(run, t_s)
    return _route_record_dict(simulation_service.get_route_at(run, client_id, t_s))


@router.get("/{run_id}/timeline")
async def get_timeline(run_id: str) -> dict[str, Any]:
    run = simulation_service.get_run(run_id)
    return {
        client_id: [
            {
                "t_s": r.t_s,
                "visible": r.visible,
                "available": r.available,
                "route_hops": r.hops if r.available else None,
                "diagnostic_reason": r.diagnostic_reason,
            }
            for r in records
        ]
        for client_id, records in run.timeline.items()
    }


@router.get("/{run_id}/export")
async def export_run(run_id: str) -> dict[str, Any]:
    run = simulation_service.get_run(run_id)
    routes = [
        _route_record_dict(record)
        for client_id in run.client_ids
        for record in run.timeline[client_id]
    ]
    return {
        "schema_version": "cosmo-A-result-1.0",
        "run_id": run.run_id,
        "routing_strategy": run.routing_strategy,
        "effective_scenario": run.scenario,
        "routes": routes,
        "summary": {cid: _metrics_dict(cid, run) for cid in run.client_ids},
    }
