"""Satellite vertex connectivity for a client in a dynamic contact graph.

The metric answers a failure-oriented question: how many satellite
vertices must be removed at once to disconnect one client from every
gateway?  Client and gateway ground nodes are never eligible for the cut.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any

import networkx as nx

from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.network.graph import build_client_routing_graph, build_snapshot_graph
from app.calculation.resilience.failure_analysis import build_graph_timeline

SECONDS_PER_DAY = 86_400


@dataclass(frozen=True)
class ConnectivityMargin:
    vertex_connectivity: int
    critical_satellites: list[str]


def _split_node(node: str, side: str) -> tuple[str, str]:
    return node, side


def compute_connectivity_margin(
    graph: nx.Graph,
    client_id: str,
    gateway_ids: list[str],
) -> ConnectivityMargin:
    """Return one satellite-only minimum vertex cut.

    Node splitting converts satellite vertex capacities to edge capacities.
    Ground vertices and contact edges receive a capacity larger than any
    possible satellite cut, so a finite minimum cut can contain satellites
    only.  If no client-to-gateway route exists, connectivity is zero.
    """
    gateways = sorted(gateway for gateway in gateway_ids if graph.has_node(gateway))
    if not graph.has_node(client_id) or not gateways:
        return ConnectivityMargin(0, [])
    if not any(nx.has_path(graph, client_id, gateway) for gateway in gateways):
        return ConnectivityMargin(0, [])

    satellites = sorted(
        node for node, data in graph.nodes(data=True) if data.get("kind") == "satellite"
    )
    non_satellite_capacity = len(satellites) + 1
    flow_graph = nx.DiGraph()

    for node, data in sorted(graph.nodes(data=True)):
        capacity = 1 if data.get("kind") == "satellite" else non_satellite_capacity
        flow_graph.add_edge(
            _split_node(node, "in"),
            _split_node(node, "out"),
            capacity=capacity,
        )

    for a, b in sorted(graph.edges()):
        flow_graph.add_edge(
            _split_node(a, "out"),
            _split_node(b, "in"),
            capacity=non_satellite_capacity,
        )
        flow_graph.add_edge(
            _split_node(b, "out"),
            _split_node(a, "in"),
            capacity=non_satellite_capacity,
        )

    sink = ("__all_gateways__", "sink")
    for gateway in gateways:
        flow_graph.add_edge(
            _split_node(gateway, "out"),
            sink,
            capacity=non_satellite_capacity,
        )

    cut_value, (source_side, sink_side) = nx.minimum_cut(
        flow_graph,
        _split_node(client_id, "out"),
        sink,
        capacity="capacity",
    )
    critical = [
        satellite
        for satellite in satellites
        if _split_node(satellite, "in") in source_side
        and _split_node(satellite, "out") in sink_side
    ]

    # A direct ground-to-gateway edge cannot be broken by removing a
    # satellite. Reference geometry does not produce such edges, but fail
    # explicitly if a custom graph violates that domain assumption.
    if cut_value >= non_satellite_capacity:
        raise ValueError("client-to-gateway connection has no satellite-only vertex cut")

    return ConnectivityMargin(int(cut_value), critical)


def _scenario_ids(scenario: dict[str, Any]) -> tuple[list[str], list[str]]:
    clients = sorted(
        site["id"] for site in scenario["ground_sites"] if site["role"] == "client"
    )
    gateways = sorted(
        site["id"] for site in scenario["ground_sites"] if site["role"] == "gateway"
    )
    return clients, gateways


def _validate_client(scenario: dict[str, Any], client_id: str) -> tuple[list[str], list[str]]:
    clients, gateways = _scenario_ids(scenario)
    if client_id not in clients:
        raise ValueError(f"Unknown client_id: {client_id}")
    return clients, gateways


def compute_at_timestamp(
    scenario: dict[str, Any],
    client_id: str,
    timestamp: float,
) -> dict[str, Any]:
    """Compute the margin at an arbitrary second in the scenario horizon."""
    horizon_s = scenario["environment"]["horizon_s"]
    if not 0 <= timestamp < horizon_s:
        raise ValueError(f"timestamp must be in [0, {horizon_s})")

    clients, gateways = _validate_client(scenario, client_id)
    env = scenario["environment"]
    snapshot = geometry_adapter.get_snapshot(scenario, timestamp)
    graph = build_snapshot_graph(
        snapshot,
        ground_ids={site["id"] for site in scenario["ground_sites"]},
        isl_range_km=env["isl_range_km"],
        min_elevation_deg=env["min_elevation_deg"],
    )
    routing_graph = build_client_routing_graph(graph, client_id, clients)
    result = compute_connectivity_margin(routing_graph, client_id, gateways)
    return {
        "client_id": client_id,
        "timestamp": timestamp,
        **asdict(result),
    }


def aggregate_daily_connectivity(
    scenario: dict[str, Any],
    graphs: list[nx.Graph],
    client_id: str,
) -> list[dict[str, Any]]:
    """Aggregate grid-point connectivity into consecutive UTC-like days.

    Scenario time is relative, so day boundaries are 0, 86400, ... seconds
    from scenario start. A final partial day is included.
    """
    clients, gateways = _validate_client(scenario, client_id)
    step_s = scenario["environment"]["step_s"]
    horizon_s = scenario["environment"]["horizon_s"]
    days: list[dict[str, Any]] = []

    for day_start_s in range(0, horizon_s, SECONDS_PER_DAY):
        day_end_s = min(day_start_s + SECONDS_PER_DAY, horizon_s)
        start_index = (day_start_s + step_s - 1) // step_s
        end_index = min((day_end_s + step_s - 1) // step_s, len(graphs))
        values: list[int] = []
        critical_counts: Counter[str] = Counter()

        for graph in graphs[start_index:end_index]:
            routing_graph = build_client_routing_graph(graph, client_id, clients)
            margin = compute_connectivity_margin(routing_graph, client_id, gateways)
            values.append(margin.vertex_connectivity)
            critical_counts.update(margin.critical_satellites)

        sample_count = len(values)
        days.append(
            {
                "day_start_s": day_start_s,
                "day_end_s": day_end_s,
                "samples_evaluated": sample_count,
                "minimum_vertex_connectivity": min(values) if values else 0,
                "mean_vertex_connectivity": sum(values) / sample_count if values else 0.0,
                "critical_satellites": [
                    {
                        "satellite_id": satellite_id,
                        "critical_samples": count,
                        "critical_fraction": count / sample_count,
                    }
                    for satellite_id, count in sorted(
                        critical_counts.items(), key=lambda item: (-item[1], item[0])
                    )
                ],
            }
        )

    return days


def compute_daily(scenario: dict[str, Any], client_id: str) -> dict[str, Any]:
    """Build the graph timeline once and return all daily aggregates."""
    graphs = build_graph_timeline(scenario)
    return {
        "client_id": client_id,
        "step_s": scenario["environment"]["step_s"],
        "days": aggregate_daily_connectivity(scenario, graphs, client_id),
    }
