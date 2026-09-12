"""Simulation endpoints: run, inspect, and export simulation runs.

Errors (`ScenarioNotFoundError`, `SimulationNotFoundError`,
`InvalidScenarioError`) are translated to HTTP responses by the global
handlers in `app.main`.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.calculation.diagnostics.outage_explainer import explain_outage
from app.calculation.metrics.bottleneck_decomposition import compute_bottleneck_breakdown
from app.calculation.metrics.outage_quality import compute_outage_quality
from app.calculation.metrics.window_quality import compute_window_quality
from app.calculation.physics.orbital_metrics import (
    coverage_footprint,
    orbital_period_s,
    propagation_delay_s,
    revolutions_per_day,
)
from app.calculation.resilience.redundancy import find_backup_path
from app.core.exceptions import SimulationNotFoundError
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


class ValidateRunsRequest(BaseModel):
    run_ids: list[str] = Field(max_length=20)


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
        "backup_path": None,
    }


def _outage_quality_dict(client_id: str, run: SimulationRun) -> dict[str, Any]:
    """Detail view alongside `max_outage_s`/`outage_count` (already in
    `ClientMetrics`) — event count is not repeated here, only the
    distribution shape those two numbers don't show (total/mean/median/P95).
    Computed from the same `available` flags already in the timeline, not a
    re-simulation."""
    stats = compute_outage_quality(
        [r.available for r in run.timeline[client_id]], run.step_s
    )
    return {
        "total_outage_s": stats.total_outage_s,
        "mean_outage_s": stats.mean_outage_s,
        "median_outage_s": stats.median_outage_s,
        "p95_outage_s": stats.p95_outage_s,
    }


def _bottleneck_breakdown_dict(client_id: str, run: SimulationRun) -> dict[str, Any]:
    """Mutually-exclusive % breakdown of WHY each step lacked a route —
    already-computed `diagnostic_reason` per step, just counted across the
    horizon (see `app.calculation.metrics.bottleneck_decomposition`)."""
    breakdown = compute_bottleneck_breakdown(
        [r.diagnostic_reason for r in run.timeline[client_id]]
    )
    return {"percentages": breakdown.percentages, "counts": breakdown.counts}


def _window_quality_dict(client_id: str, run: SimulationRun) -> dict[str, Any]:
    """Contact windows (geometric visibility) and service windows (full
    route to gateway) — see `app.calculation.metrics.window_quality`.
    Computed from the same per-step flags already in the timeline."""
    records = run.timeline[client_id]
    contact = compute_window_quality([r.visible for r in records], run.step_s)
    service = compute_window_quality([r.available for r in records], run.step_s)
    return {
        "contact_window": {
            "window_count": contact.window_count,
            "mean_window_s": contact.mean_window_s,
            "median_window_s": contact.median_window_s,
            "p95_window_s": contact.p95_window_s,
            "longest_window_s": contact.longest_window_s,
        },
        "service_window": {
            "window_count": service.window_count,
            "mean_window_s": service.mean_window_s,
            "median_window_s": service.median_window_s,
            "p95_window_s": service.p95_window_s,
            "longest_window_s": service.longest_window_s,
        },
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
        "outage_quality": _outage_quality_dict(client_id, run),
        "bottleneck_breakdown": _bottleneck_breakdown_dict(client_id, run),
        "window_quality": _window_quality_dict(client_id, run),
    }


def _physics_dict(run: SimulationRun) -> dict[str, Any]:
    """Scenario-level orbital metrics plus geometric propagation delay
    distribution over the routes this run actually used — derived,
    read-only physics, see docs/physical-model.md. Does not touch
    reference geometry; only reads `environment.altitude_km`/
    `min_elevation_deg` and each route's already-computed
    `total_distance_km`."""
    env = run.scenario["environment"]
    altitude_km = env["altitude_km"]
    footprint = coverage_footprint(altitude_km, env["min_elevation_deg"])
    distances_km = [
        record.total_distance_km
        for records in run.timeline.values()
        for record in records
        if record.available and record.total_distance_km is not None
    ]
    delays_s = sorted(propagation_delay_s(d) for d in distances_km)
    return {
        "altitude_km": altitude_km,
        "orbital_period_s": orbital_period_s(altitude_km),
        "revolutions_per_day": revolutions_per_day(altitude_km),
        "coverage_footprint": {
            "half_angle_deg": footprint.half_angle_deg,
            "ground_radius_km": footprint.ground_radius_km,
            "area_km2": footprint.area_km2,
        },
        "geometric_propagation_delay_s": {
            "mean": (sum(delays_s) / len(delays_s)) if delays_s else None,
            "p95": delays_s[int(0.95 * (len(delays_s) - 1))] if delays_s else None,
            "max": delays_s[-1] if delays_s else None,
        },
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
        "physics": _physics_dict(run),
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


@router.post("/validate")
async def validate_runs(payload: ValidateRunsRequest) -> dict[str, list[str]]:
    """Split browser-persisted run IDs into live and stale sets."""
    existing: list[str] = []
    missing: list[str] = []
    for run_id in payload.run_ids:
        try:
            simulation_service.get_run(run_id)
            existing.append(run_id)
        except SimulationNotFoundError:
            missing.append(run_id)
    return {"existing": existing, "missing": missing}


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
    record = simulation_service.get_route_at(run, client_id, t_s)
    result = _route_record_dict(record)
    if record.available:
        backup = find_backup_path(run.scenario, client_id, run.gateway_ids, t_s, record.path)
        result["backup_path"] = backup.backup_path
    if not record.available:
        explanation = explain_outage(run.scenario, client_id, run.gateway_ids, t_s)
        result["explanation"] = {
            "visible_satellite_count": explanation.visible_satellite_count,
            "min_elevation_deg": explanation.min_elevation_deg,
            "nearest_below_threshold_satellite_id": explanation.nearest_below_threshold_satellite_id,
            "nearest_below_threshold_elevation_deg": explanation.nearest_below_threshold_elevation_deg,
            "gateway_contact": explanation.gateway_contact,
            "gateway_in_outage": explanation.gateway_in_outage,
            "network_component_count": explanation.network_component_count,
            "client_component_size": explanation.client_component_size,
            "gateway_component_size": explanation.gateway_component_size,
            "same_component_as_gateway": explanation.same_component_as_gateway,
        }
    return result


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
