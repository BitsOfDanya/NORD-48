"""Derived failure overlays and deterministic N-1 satellite criticality.

Geometry snapshots are built once.  An injected failure is represented by
removing satellite nodes from copies of the affected contact graphs; the
scenario and baseline graphs are never mutated.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

import networkx as nx

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
from app.models.route import RouteRecord


def validate_interval(start_s: int, end_s: int, horizon_s: int) -> None:
    if start_s < 0 or end_s > horizon_s or start_s >= end_s:
        raise ValueError(f"analysis interval must satisfy 0 <= start < end <= {horizon_s}")


def build_graph_timeline(scenario: dict[str, Any]) -> list[nx.Graph]:
    """Build the baseline contact graphs once from reference snapshots."""
    env = scenario["environment"]
    ground_ids = {g["id"] for g in scenario["ground_sites"]}
    params = {
        "ground_ids": ground_ids,
        "isl_range_km": env["isl_range_km"],
        "min_elevation_deg": env["min_elevation_deg"],
    }
    return [
        build_snapshot_graph(
            geometry_adapter.get_snapshot(scenario, step * env["step_s"]), **params
        )
        for step in range(env["horizon_s"] // env["step_s"])
    ]


def apply_failure_overlay(
    baseline_graphs: list[nx.Graph],
    satellite_ids: set[str],
    start_s: int,
    end_s: int,
    step_s: int,
) -> list[nx.Graph]:
    """Return a derived graph timeline; interval semantics are [start, end)."""
    overlaid: list[nx.Graph] = []
    for index, baseline in enumerate(baseline_graphs):
        t_s = index * step_s
        if start_s <= t_s < end_s:
            graph = baseline.copy()
            graph.remove_nodes_from(satellite_ids)
            overlaid.append(graph)
        else:
            overlaid.append(baseline)
    return overlaid


def _ids(scenario: dict[str, Any]) -> tuple[list[str], list[str]]:
    clients = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    gateways = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    return clients, gateways


def compute_timeline(
    scenario: dict[str, Any], graphs: list[nx.Graph], strategy: str
) -> dict[str, list[RouteRecord]]:
    """Route over supplied graphs without calling geometry again."""
    env = scenario["environment"]
    clients, gateways = _ids(scenario)
    routing_graphs = [graph.copy() for graph in graphs] if strategy == "maximum_persistence" else graphs
    expiry = compute_edge_expiry_steps(routing_graphs)
    if strategy == "maximum_persistence":
        for graph, edge_expiry in zip(routing_graphs, expiry, strict=True):
            attach_edge_expiry(graph, edge_expiry)

    timeline: dict[str, list[RouteRecord]] = {client: [] for client in clients}
    for step, full_graph in enumerate(routing_graphs):
        t_s = step * env["step_s"]
        for client in clients:
            visible = full_graph.has_node(client) and full_graph.degree(client) > 0
            graph = build_client_routing_graph(full_graph, client, clients)
            route = compute_route(graph, client, gateways, t_s, strategy)
            if route.has_route:
                record = RouteRecord(
                    t_s=t_s,
                    client_id=client,
                    gateway_id=route.gateway_id,
                    strategy=strategy,
                    path=route.path,
                    hops=route.hops,
                    total_distance_km=route.total_distance_km,
                    bottleneck_margin=route.bottleneck_margin,
                    bottleneck_edge=route.bottleneck_edge,
                    visible=visible,
                )
            else:
                diagnostic = diagnose(full_graph, scenario, client, gateways, t_s)
                record = RouteRecord(
                    t_s=t_s,
                    client_id=client,
                    gateway_id=diagnostic.gateway_id,
                    strategy=strategy,
                    visible=visible,
                    diagnostic_reason=diagnostic.reason,
                    diagnostic_checks=diagnostic.checks,
                )
            timeline[client].append(record)

    for records in timeline.values():
        annotate_route_lifetimes(
            records, routing_graphs, expiry, env["step_s"], env["horizon_s"]
        )
    return timeline


def _client_metrics(
    scenario: dict[str, Any], client: str, records: list[RouteRecord]
) -> ClientMetrics:
    env = scenario["environment"]
    return compute_client_metrics(
        client_id=client,
        visible_flags=[record.visible for record in records],
        available_flags=[record.available for record in records],
        hops=[record.hops if record.available else None for record in records],
        distances=[record.total_distance_km for record in records],
        paths=[tuple(record.path) for record in records],
        step_s=env["step_s"],
        target_availability=env["target_availability"],
    )


def _metric_dict(metrics: ClientMetrics, n_steps: int, step_s: int) -> dict[str, Any]:
    return {
        "availability": metrics.availability_fraction,
        "availability_percent": metrics.availability_percent,
        "visibility": metrics.visibility_fraction,
        "visibility_percent": metrics.visibility_percent,
        "max_outage_s": metrics.max_outage_s,
        "route_change_count": metrics.route_change_count,
        "mean_hops": metrics.average_hops,
        "time_below_target_s": (n_steps - round(metrics.availability_fraction * n_steps))
        * step_s,
        "target_reached": metrics.target_achieved,
    }


def compare_timelines(
    scenario: dict[str, Any],
    baseline: dict[str, list[RouteRecord]],
    failed: dict[str, list[RouteRecord]],
    *,
    include_timeline: bool,
) -> dict[str, Any]:
    env = scenario["environment"]
    clients, _gateways = _ids(scenario)
    client_results: list[dict[str, Any]] = []
    overall_induced: Counter[str] = Counter()
    affected_clients: list[str] = []
    target_violations: list[str] = []
    timeline_impact: dict[str, list[dict[str, Any]]] = {}

    for client in clients:
        baseline_records = baseline[client]
        failed_records = failed[client]
        baseline_metrics = _client_metrics(scenario, client, baseline_records)
        failed_metrics = _client_metrics(scenario, client, failed_records)
        induced = Counter(
            failed_record.diagnostic_reason
            for baseline_record, failed_record in zip(
                baseline_records, failed_records, strict=True
            )
            if baseline_record.available
            and not failed_record.available
            and failed_record.diagnostic_reason is not None
        )
        baseline_outages = Counter(
            record.diagnostic_reason
            for record in baseline_records
            if not record.available and record.diagnostic_reason is not None
        )
        all_failed_outages = Counter(
            record.diagnostic_reason
            for record in failed_records
            if not record.available and record.diagnostic_reason is not None
        )
        overall_induced.update(induced)
        induced_steps = sum(induced.values())
        disrupted_steps = sum(
            baseline_record.path != failed_record.path
            for baseline_record, failed_record in zip(
                baseline_records, failed_records, strict=True
            )
            if baseline_record.available
        )
        drop_pp = (
            baseline_metrics.availability_fraction - failed_metrics.availability_fraction
        ) * 100
        if drop_pp > 1e-12 or disrupted_steps > 0:
            affected_clients.append(client)
        if baseline_metrics.target_achieved and not failed_metrics.target_achieved:
            target_violations.append(client)

        baseline_dict = _metric_dict(
            baseline_metrics, len(baseline_records), env["step_s"]
        )
        failed_dict = _metric_dict(failed_metrics, len(failed_records), env["step_s"])
        client_results.append(
            {
                "client_id": client,
                "baseline": baseline_dict,
                "failed": failed_dict,
                "delta": {
                    "availability_pp": failed_metrics.availability_percent
                    - baseline_metrics.availability_percent,
                    "visibility_pp": failed_metrics.visibility_percent
                    - baseline_metrics.visibility_percent,
                    "max_outage_s": failed_metrics.max_outage_s
                    - baseline_metrics.max_outage_s,
                    "route_changes": failed_metrics.route_change_count
                    - baseline_metrics.route_change_count,
                    "mean_hops": (
                        None
                        if baseline_metrics.average_hops is None
                        or failed_metrics.average_hops is None
                        else failed_metrics.average_hops - baseline_metrics.average_hops
                    ),
                },
                "diagnostics": {
                    "baseline_outages": dict(sorted(baseline_outages.items())),
                    "all_failed_outages": dict(sorted(all_failed_outages.items())),
                    "failure_induced": dict(sorted(induced.items())),
                },
                "route_disruption": {
                    "failure_induced_outage_steps": induced_steps,
                    "changed_or_lost_route_steps": disrupted_steps,
                },
            }
        )
        if include_timeline:
            timeline_impact[client] = [
                {
                    "t_s": baseline_record.t_s,
                    "baseline_available": baseline_record.available,
                    "failed_available": failed_record.available,
                    "failure_induced": baseline_record.available
                    and not failed_record.available,
                    "route_disrupted": baseline_record.path != failed_record.path,
                }
                for baseline_record, failed_record in zip(
                    baseline_records, failed_records, strict=True
                )
            ]

    return {
        "clients": client_results,
        "affected_clients": affected_clients,
        "target_violations": target_violations,
        "diagnostic_distribution": dict(sorted(overall_induced.items())),
        "timeline_impact": timeline_impact,
    }


def run_failure_analysis(
    scenario: dict[str, Any],
    satellite_ids: list[str],
    start_s: int,
    end_s: int,
    strategy: str,
) -> dict[str, Any]:
    env = scenario["environment"]
    validate_interval(start_s, end_s, env["horizon_s"])
    known = {satellite["id"] for satellite in scenario["design"]["satellites"]}
    unknown = sorted(set(satellite_ids) - known)
    if not satellite_ids or unknown:
        raise ValueError(
            "satellite_ids must be non-empty and known"
            + (f": {', '.join(unknown)}" if unknown else "")
        )
    baseline_graphs = build_graph_timeline(scenario)
    failed_graphs = apply_failure_overlay(
        baseline_graphs, set(satellite_ids), start_s, end_s, env["step_s"]
    )
    baseline = compute_timeline(scenario, baseline_graphs, strategy)
    failed = compute_timeline(scenario, failed_graphs, strategy)
    comparison = compare_timelines(
        scenario, baseline, failed, include_timeline=True
    )
    return {
        "experiment": {
            "scenario_id": scenario.get("meta", {}).get("id"),
            "scenario_title": scenario.get("meta", {}).get("title"),
            "satellite_ids": sorted(set(satellite_ids)),
            "failure_start_s": start_s,
            "failure_end_s": end_s,
            "routing_strategy": strategy,
            "step_s": env["step_s"],
            "horizon_s": env["horizon_s"],
            "interval_semantics": "[start_s, end_s)",
        },
        **comparison,
    }


def run_n1_criticality(
    scenario: dict[str, Any], start_s: int, end_s: int, strategy: str
) -> dict[str, Any]:
    env = scenario["environment"]
    validate_interval(start_s, end_s, env["horizon_s"])
    baseline_graphs = build_graph_timeline(scenario)
    baseline = compute_timeline(scenario, baseline_graphs, strategy)
    first_step = max(0, start_s // env["step_s"])
    last_step = min(len(baseline_graphs), (end_s + env["step_s"] - 1) // env["step_s"])
    active_satellites = sorted(
        {
            node
            for graph in baseline_graphs[first_step:last_step]
            for node, data in graph.nodes(data=True)
            if data.get("kind") == "satellite"
        }
    )
    planes = {
        satellite["id"]: satellite["plane_id"]
        for satellite in scenario["design"]["satellites"]
    }
    rows: list[dict[str, Any]] = []
    for satellite_id in active_satellites:
        variant_graphs = apply_failure_overlay(
            baseline_graphs, {satellite_id}, start_s, end_s, env["step_s"]
        )
        failed = compute_timeline(scenario, variant_graphs, strategy)
        comparison = compare_timelines(
            scenario, baseline, failed, include_timeline=False
        )
        clients = comparison["clients"]
        drops = [-client["delta"]["availability_pp"] for client in clients]
        row = {
            "satellite_id": satellite_id,
            "plane_id": planes[satellite_id],
            "worst_client_availability_drop_pp": max(drops, default=0.0),
            "mean_availability_drop_pp": sum(drops) / len(drops) if drops else 0.0,
            "affected_clients_count": len(comparison["affected_clients"]),
            "affected_clients": comparison["affected_clients"],
            "target_violations_count": len(comparison["target_violations"]),
            "target_violations": comparison["target_violations"],
            "max_outage_increase_s": max(
                (client["delta"]["max_outage_s"] for client in clients), default=0
            ),
            "additional_route_changes": sum(
                client["delta"]["route_changes"] for client in clients
            ),
            "failure_induced_outage_steps": sum(
                client["route_disruption"]["failure_induced_outage_steps"]
                for client in clients
            ),
        }
        rows.append(row)

    rows.sort(
        key=lambda row: (
            -row["target_violations_count"],
            -row["worst_client_availability_drop_pp"],
            -row["max_outage_increase_s"],
            -row["affected_clients_count"],
            -row["failure_induced_outage_steps"],
            row["satellite_id"],
        )
    )
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank

    top = rows[0] if rows else None
    recommendation = (
        "Активные аппараты в интервале анализа отсутствуют."
        if top is None
        else (
            f"Наиболее критический аппарат — {top['satellite_id']}. Максимальное "
            f"снижение доступности клиента: {top['worst_client_availability_drop_pp']:.2f} п.п.; "
            f"нарушений целевого уровня: {top['target_violations_count']}; "
            f"затронуты: {', '.join(top['affected_clients']) or 'нет'}."
        )
    )
    return {
        "experiment": {
            "scenario_id": scenario.get("meta", {}).get("id"),
            "scenario_title": scenario.get("meta", {}).get("title"),
            "analysis_start_s": start_s,
            "analysis_end_s": end_s,
            "routing_strategy": strategy,
            "step_s": env["step_s"],
            "horizon_s": env["horizon_s"],
            "satellites_analyzed": len(rows),
            "baseline_geometry_runs": 1,
        },
        "ranking": rows,
        "recommendation": recommendation,
    }
