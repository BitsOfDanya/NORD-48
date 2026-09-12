from __future__ import annotations

from itertools import combinations

import networkx as nx

from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.network.graph import build_client_routing_graph, build_snapshot_graph
from app.calculation.resilience.connectivity_margin import (
    aggregate_daily_connectivity,
    compute_connectivity_margin,
)
from app.services.scenario_service import get_example


def _graph(edges: list[tuple[str, str]]) -> nx.Graph:
    graph = nx.Graph()
    nodes = {node for edge in edges for node in edge}
    for node in nodes:
        graph.add_node(
            node,
            kind="satellite" if node.startswith("S") else "ground",
        )
    graph.add_edges_from(edges)
    return graph


def test_two_independent_paths_require_two_satellite_failures() -> None:
    graph = _graph(
        [
            ("C", "S1"),
            ("S1", "G"),
            ("C", "S2"),
            ("S2", "G"),
        ]
    )

    result = compute_connectivity_margin(graph, "C", ["G"])

    assert result.vertex_connectivity == 2
    assert result.critical_satellites == ["S1", "S2"]


def test_shared_satellite_is_the_single_vertex_cut() -> None:
    graph = _graph(
        [
            ("C", "S1"),
            ("C", "S2"),
            ("S1", "S3"),
            ("S2", "S3"),
            ("S3", "G"),
        ]
    )

    result = compute_connectivity_margin(graph, "C", ["G"])

    assert result.vertex_connectivity == 1
    assert result.critical_satellites == ["S3"]


def test_cut_must_disconnect_all_gateways() -> None:
    graph = _graph(
        [
            ("C", "S1"),
            ("S1", "G1"),
            ("C", "S2"),
            ("S2", "G2"),
        ]
    )

    result = compute_connectivity_margin(graph, "C", ["G1", "G2"])

    assert result.vertex_connectivity == 2
    assert result.critical_satellites == ["S1", "S2"]


def test_disconnected_client_has_zero_connectivity() -> None:
    graph = _graph([("S1", "G")])
    graph.add_node("C", kind="ground")

    result = compute_connectivity_margin(graph, "C", ["G"])

    assert result.vertex_connectivity == 0
    assert result.critical_satellites == []


def test_three_independent_paths_require_three_satellite_failures() -> None:
    graph = _graph(
        [
            ("C", "S1"),
            ("S1", "G"),
            ("C", "S2"),
            ("S2", "G"),
            ("C", "S3"),
            ("S3", "G"),
        ]
    )

    result = compute_connectivity_margin(graph, "C", ["G"])

    assert result.vertex_connectivity == 3
    assert result.critical_satellites == ["S1", "S2", "S3"]


def test_client_and_gateway_are_never_reported_as_critical() -> None:
    # A degenerate case with only a client-gateway pair and one relay: the
    # only possible cut is the satellite, never the ground endpoints
    # themselves, no matter how the graph is shaped.
    graph = _graph([("C", "S1"), ("S1", "G")])

    result = compute_connectivity_margin(graph, "C", ["G"])

    assert "C" not in result.critical_satellites
    assert "G" not in result.critical_satellites
    assert result.critical_satellites == ["S1"]


def test_connectivity_margin_is_deterministic_across_repeated_calls() -> None:
    graph = _graph(
        [
            ("C", "S1"),
            ("C", "S2"),
            ("S1", "S3"),
            ("S2", "S3"),
            ("S1", "S4"),
            ("S2", "S4"),
            ("S3", "G"),
            ("S4", "G"),
        ]
    )

    results = [compute_connectivity_margin(graph, "C", ["G"]) for _ in range(10)]

    assert len({(r.vertex_connectivity, tuple(r.critical_satellites)) for r in results}) == 1


def _real_routing_graph(scenario: dict, t_s: float, client_id: str) -> nx.Graph:
    env = scenario["environment"]
    ground_ids = {g["id"] for g in scenario["ground_sites"]}
    clients = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    snapshot = geometry_adapter.get_snapshot(scenario, t_s)
    full_graph = build_snapshot_graph(
        snapshot,
        ground_ids=ground_ids,
        isl_range_km=env["isl_range_km"],
        min_elevation_deg=env["min_elevation_deg"],
    )
    return build_client_routing_graph(full_graph, client_id, clients)


def _has_route(graph: nx.Graph, client_id: str, gateway_ids: list[str], removed: list[str]) -> bool:
    if not graph.has_node(client_id):
        return False
    reduced = graph.copy()
    reduced.remove_nodes_from(removed)
    return reduced.has_node(client_id) and any(
        reduced.has_node(gw) and nx.has_path(reduced, client_id, gw) for gw in gateway_ids
    )


def test_margin_two_cross_checked_against_exhaustive_single_failures() -> None:
    """Independent sanity check (not the same code path as N-1): on a real
    snapshot where the margin is >=2, exhaustively remove every single
    satellite one at a time and confirm none of them break the route —
    otherwise the margin would be a lie."""
    scenario = get_example("01_full_constellation")
    gateways = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    graph = _real_routing_graph(scenario, 0, "C65")
    result = compute_connectivity_margin(graph, "C65", gateways)
    assert result.vertex_connectivity >= 2

    satellites = sorted(n for n, d in graph.nodes(data=True) if d.get("kind") == "satellite")
    broken_by_single_failure = [s for s in satellites if not _has_route(graph, "C65", gateways, [s])]
    assert broken_by_single_failure == []


def test_margin_three_cross_checked_against_exhaustive_pair_failures() -> None:
    """Same cross-check at K=2: on a snapshot where margin is >=3, no pair
    of satellite failures should break the route either."""
    scenario = get_example("01_full_constellation")
    gateways = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    graph = _real_routing_graph(scenario, 15_000, "C65")
    result = compute_connectivity_margin(graph, "C65", gateways)
    assert result.vertex_connectivity >= 3

    satellites = sorted(n for n, d in graph.nodes(data=True) if d.get("kind") == "satellite")
    broken_by_pair_failure = [
        pair for pair in combinations(satellites, 2) if not _has_route(graph, "C65", gateways, list(pair))
    ]
    assert broken_by_pair_failure == []


def test_daily_average_when_connected_is_none_if_never_connected() -> None:
    scenario = {
        "environment": {"step_s": 43_200, "horizon_s": 86_400},
        "ground_sites": [
            {"id": "C", "role": "client"},
            {"id": "G", "role": "gateway"},
        ],
    }
    graphs = [_graph([("S1", "G")]), _graph([("S1", "G")])]
    for graph in graphs:
        graph.add_node("C", kind="ground")

    days = aggregate_daily_connectivity(scenario, graphs, "C")

    assert days[0]["average_when_connected"] is None
    assert days[0]["distribution"]["no_route_pct"] == 100.0


def test_daily_aggregation_reports_minimum_mean_and_critical_frequency() -> None:
    scenario = {
        "environment": {"step_s": 43_200, "horizon_s": 172_800},
        "ground_sites": [
            {"id": "C", "role": "client"},
            {"id": "G", "role": "gateway"},
        ],
    }
    graphs = [
        _graph([("C", "S1"), ("S1", "G"), ("C", "S2"), ("S2", "G")]),
        _graph([("C", "S3"), ("S3", "G")]),
        _graph([("S1", "G")]),
        _graph([("C", "S4"), ("S4", "G")]),
    ]
    graphs[2].add_node("C", kind="ground")

    days = aggregate_daily_connectivity(scenario, graphs, "C")

    assert len(days) == 2
    assert days[0]["minimum_vertex_connectivity"] == 1
    assert days[0]["mean_vertex_connectivity"] == 1.5
    assert days[0]["samples_evaluated"] == 2
    assert days[0]["average_when_connected"] == 1.5
    assert days[0]["distribution"] == {
        "no_route_pct": 0.0,
        "margin_1_pct": 50.0,
        "margin_2_pct": 50.0,
        "margin_3_plus_pct": 0.0,
    }
    assert days[1]["minimum_vertex_connectivity"] == 0
    assert days[1]["mean_vertex_connectivity"] == 0.5
    assert days[1]["average_when_connected"] == 1.0
    assert days[1]["distribution"] == {
        "no_route_pct": 50.0,
        "margin_1_pct": 50.0,
        "margin_2_pct": 0.0,
        "margin_3_plus_pct": 0.0,
    }
    assert days[1]["critical_satellites"] == [
        {
            "satellite_id": "S4",
            "critical_samples": 1,
            "critical_fraction": 0.5,
        }
    ]
