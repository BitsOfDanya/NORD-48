"""Simulation orchestration.

Ties geometry, the dynamic contact graph, routing, diagnostics, and
metrics together. Completed runs stay in the in-memory hot cache and are
also written to the configured durable run directory.

Pipeline for the full horizon:

    geometry snapshots -> contact graphs -> edge persistence -> per-client routing graph
    -> route (or diagnosis if none) -> recorded into the run timeline

Metrics are then computed once per client from the full timeline.
"""

from __future__ import annotations

import gzip
import logging
import os
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any

import orjson

from app.calculation.diagnostics.diagnostics import diagnose
from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.metrics.metrics import ClientMetrics, compute_client_metrics
from app.calculation.network.graph import build_client_routing_graph, build_snapshot_graph
from app.calculation.routing.router import compute_route
from app.calculation.routing.stability import (
    annotate_route_lifetimes,
    attach_edge_expiry,
    compute_edge_expiry_steps,
)
from app.core.config import get_settings
from app.core.exceptions import SimulationNotFoundError
from app.models.route import RouteRecord
from app.models.simulation import SimulationRun

_RUNS: dict[str, SimulationRun] = {}
logger = logging.getLogger(__name__)


def _runs_dir() -> Path | None:
    configured = get_settings().runs_dir
    return Path(configured) if configured else None


def _run_path(run_id: str) -> Path | None:
    directory = _runs_dir()
    if directory is None:
        return None
    try:
        canonical_id = str(uuid.UUID(run_id))
    except ValueError as exc:
        raise SimulationNotFoundError(f"Simulation run not found: {run_id}") from exc
    return directory / f"{canonical_id}.json.gz"


def _persist_run(run: SimulationRun) -> None:
    path = _run_path(run.run_id)
    if path is None:
        return

    payload = {
        "run_id": run.run_id,
        "scenario": run.scenario,
        "routing_strategy": run.routing_strategy,
        "step_s": run.step_s,
        "horizon_s": run.horizon_s,
        "n_steps": run.n_steps,
        "client_ids": run.client_ids,
        "gateway_ids": run.gateway_ids,
        "metrics": {client_id: asdict(metrics) for client_id, metrics in run.metrics.items()},
        "timeline": {
            client_id: [asdict(record) for record in records]
            for client_id, records in run.timeline.items()
        },
        "created_at": run.created_at,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(".tmp")
    with gzip.open(temporary_path, "wb", compresslevel=6) as output:
        output.write(orjson.dumps(payload))
    os.replace(temporary_path, path)


def _load_persisted_run(run_id: str) -> SimulationRun | None:
    path = _run_path(run_id)
    if path is None or not path.is_file():
        return None

    try:
        with gzip.open(path, "rb") as source:
            payload = orjson.loads(source.read())
        metrics = {
            client_id: ClientMetrics(**values)
            for client_id, values in payload["metrics"].items()
        }
        timeline: dict[str, list[RouteRecord]] = {}
        for client_id, records in payload["timeline"].items():
            timeline[client_id] = []
            for values in records:
                bottleneck_edge = values.get("bottleneck_edge")
                if bottleneck_edge is not None:
                    values["bottleneck_edge"] = tuple(bottleneck_edge)
                timeline[client_id].append(RouteRecord(**values))
        return SimulationRun(
            run_id=payload["run_id"],
            scenario=payload["scenario"],
            routing_strategy=payload["routing_strategy"],
            step_s=payload["step_s"],
            horizon_s=payload["horizon_s"],
            n_steps=payload["n_steps"],
            client_ids=payload["client_ids"],
            gateway_ids=payload["gateway_ids"],
            metrics=metrics,
            timeline=timeline,
            created_at=payload["created_at"],
        )
    except (OSError, KeyError, TypeError, orjson.JSONDecodeError) as exc:
        logger.warning("Could not restore simulation run %s: %s", run_id, exc)
        return None


def scenario_graph_params(scenario: dict[str, Any]) -> dict[str, Any]:
    """Extract the scenario values `build_snapshot_graph` needs to compute
    link margins: ground node IDs and the ISL/elevation thresholds."""
    env = scenario["environment"]
    return {
        "ground_ids": {g["id"] for g in scenario["ground_sites"]},
        "isl_range_km": env["isl_range_km"],
        "min_elevation_deg": env["min_elevation_deg"],
    }


def _compute_route_record(
    scenario: dict[str, Any],
    client_id: str,
    gateway_ids: list[str],
    all_client_ids: list[str],
    t_s: float,
    routing_strategy: str,
    graph_params: dict[str, Any] | None = None,
    full_graph: Any | None = None,
) -> RouteRecord:
    if full_graph is None:
        snapshot = geometry_adapter.get_snapshot(scenario, t_s)
        full_graph = build_snapshot_graph(
            snapshot, **(graph_params or scenario_graph_params(scenario))
        )
    if routing_strategy == "maximum_persistence" and any(
        "persistence_until_step" not in data
        for _a, _b, data in full_graph.edges(data=True)
    ):
        env = scenario["environment"]
        params = graph_params or scenario_graph_params(scenario)
        future_graphs = [full_graph]
        future_t = t_s + env["step_s"]
        while future_t < env["horizon_s"]:
            future_graphs.append(
                build_snapshot_graph(
                    geometry_adapter.get_snapshot(scenario, future_t), **params
                )
            )
            future_t += env["step_s"]
        future_expiry = compute_edge_expiry_steps(future_graphs)
        attach_edge_expiry(full_graph, future_expiry[0])
    visible = full_graph.has_node(client_id) and full_graph.degree(client_id) > 0

    routing_graph = build_client_routing_graph(full_graph, client_id, all_client_ids)
    route = compute_route(routing_graph, client_id, gateway_ids, t_s, routing_strategy)

    if route.has_route:
        return RouteRecord(
            t_s=t_s,
            client_id=client_id,
            gateway_id=route.gateway_id,
            strategy=routing_strategy,
            path=route.path,
            hops=route.hops,
            total_distance_km=route.total_distance_km,
            bottleneck_margin=route.bottleneck_margin,
            bottleneck_edge=route.bottleneck_edge,
            visible=visible,
        )

    diagnosis = diagnose(full_graph, scenario, client_id, gateway_ids, t_s)
    return RouteRecord(
        t_s=t_s,
        client_id=client_id,
        gateway_id=diagnosis.gateway_id,
        strategy=routing_strategy,
        path=[],
        hops=0,
        total_distance_km=None,
        visible=visible,
        diagnostic_reason=diagnosis.reason,
        diagnostic_checks=diagnosis.checks,
    )


def run_simulation(
    scenario: dict[str, Any], routing_strategy: str = "minimum_hops", run_id: str | None = None
) -> SimulationRun:
    """Simulate the full scenario horizon and compute per-client metrics.

    `scenario` must already be schema- and reference-validated (see
    `app.services.scenario_service`).
    """
    geometry_adapter.validate_scenario(scenario)

    env = scenario["environment"]
    step_s = env["step_s"]
    horizon_s = env["horizon_s"]
    n_steps = horizon_s // step_s

    client_ids = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    gateway_ids = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    graph_params = scenario_graph_params(scenario)

    timeline: dict[str, list[RouteRecord]] = {client_id: [] for client_id in client_ids}
    full_graphs = [
        build_snapshot_graph(
            geometry_adapter.get_snapshot(scenario, step * step_s), **graph_params
        )
        for step in range(n_steps)
    ]
    expiry_steps = compute_edge_expiry_steps(full_graphs)
    for graph, expiry in zip(full_graphs, expiry_steps, strict=True):
        attach_edge_expiry(graph, expiry)

    for step, full_graph in enumerate(full_graphs):
        t_s = step * step_s
        for client_id in client_ids:
            record = _compute_route_record(
                scenario,
                client_id,
                gateway_ids,
                client_ids,
                t_s,
                routing_strategy,
                graph_params,
                full_graph,
            )
            timeline[client_id].append(record)

    for records in timeline.values():
        annotate_route_lifetimes(records, full_graphs, expiry_steps, step_s, horizon_s)

    metrics = {
        client_id: compute_client_metrics(
            client_id=client_id,
            visible_flags=[r.visible for r in records],
            available_flags=[r.available for r in records],
            hops=[r.hops if r.available else None for r in records],
            distances=[r.total_distance_km for r in records],
            paths=[tuple(r.path) for r in records],
            step_s=step_s,
            target_availability=env["target_availability"],
        )
        for client_id, records in timeline.items()
    }

    run = SimulationRun(
        run_id=run_id or str(uuid.uuid4()),
        scenario=scenario,
        routing_strategy=routing_strategy,
        step_s=step_s,
        horizon_s=horizon_s,
        n_steps=n_steps,
        client_ids=client_ids,
        gateway_ids=gateway_ids,
        metrics=metrics,
        timeline=timeline,
    )
    _RUNS[run.run_id] = run
    _persist_run(run)
    return run


def get_run(run_id: str) -> SimulationRun:
    run = _RUNS.get(run_id)
    if run is not None:
        return run

    run = _load_persisted_run(run_id)
    if run is not None:
        _RUNS[run_id] = run
        return run

    raise SimulationNotFoundError(f"Simulation run not found: {run_id}")


def get_route_at(run: SimulationRun, client_id: str, t_s: float) -> RouteRecord:
    """Return a client's route at time t_s.

    Reuses the precomputed timeline record when `t_s` lands exactly on the
    simulation's time grid; otherwise recomputes a single snapshot/route on
    the fly (cheap — one geometry snapshot for ~48 satellites).
    """
    step = t_s / run.step_s
    step_index = round(step)
    if 0 <= step_index < run.n_steps and step_index * run.step_s == t_s:
        return run.timeline[client_id][step_index]

    return _compute_route_record(
        run.scenario, client_id, run.gateway_ids, run.client_ids, t_s, run.routing_strategy
    )


def get_snapshot_view(run: SimulationRun, t_s: float) -> dict[str, Any]:
    """Build a frontend-ready snapshot: satellites (with lat/lon/alt), typed
    edges, ground sites, and every client's route at time t_s."""
    snapshot = geometry_adapter.get_snapshot(run.scenario, t_s)

    satellites = []
    for sat in snapshot["satellites"]:
        lat_deg, lon_deg, altitude_km = geometry_adapter.ecef_to_geodetic(
            sat["x_km"], sat["y_km"], sat["z_km"]
        )
        satellites.append(
            {
                "id": sat["id"],
                "active": sat["active"],
                "x_km": sat["x_km"],
                "y_km": sat["y_km"],
                "z_km": sat["z_km"],
                "lat_deg": lat_deg,
                "lon_deg": lon_deg,
                "altitude_km": altitude_km,
            }
        )

    ground_ids = {g["id"] for g in run.scenario["ground_sites"]}
    edges = [
        {
            "a": a,
            "b": b,
            "distance_km": distance_km,
            "kind": "ground_contact" if (a in ground_ids or b in ground_ids) else "isl",
        }
        for a, b, distance_km in snapshot["edges"]
    ]

    ground_sites = [
        {
            "id": g["id"],
            "name": g.get("name"),
            "role": g["role"],
            "lat_deg": g["lat_deg"],
            "lon_deg": g["lon_deg"],
        }
        for g in run.scenario["ground_sites"]
    ]

    routes = {
        client_id: get_route_at(run, client_id, t_s) for client_id in run.client_ids
    }

    return {
        "t_s": t_s,
        "satellites": satellites,
        "edges": edges,
        "ground_sites": ground_sites,
        "routes": routes,
    }
