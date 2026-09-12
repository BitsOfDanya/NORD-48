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


def _has_route_after_failures(
    graph: nx.Graph,
    client_id: str,
    gateway_ids: list[str],
    failed_satellites: tuple[str, ...] | list[str],
) -> bool:
    remaining = graph.copy()
    remaining.remove_nodes_from(failed_satellites)
    return remaining.has_node(client_id) and any(
        remaining.has_node(gateway) and nx.has_path(remaining, client_id, gateway)
        for gateway in gateway_ids
    )


def _assert_brute_force_lower_order_failures_preserve_route(
    graph: nx.Graph,
    client_id: str,
    gateway_ids: list[str],
    margin: int,
    max_failure_size: int,
) -> None:
    satellites = sorted(
        node for node, data in graph.nodes(data=True) if data.get("kind") == "satellite"
    )
    for failure_size in range(1, min(margin, max_failure_size + 1)):
        for failed in combinations(satellites, failure_size):
            assert _has_route_after_failures(graph, client_id, gateway_ids, failed), failed


def _assert_reported_cut_disconnects_all_gateways(
    graph: nx.Graph,
    client_id: str,
    gateway_ids: list[str],
    critical_satellites: list[str],
) -> None:
    assert not _has_route_after_failures(
        graph, client_id, gateway_ids, critical_satellites
    )


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
    _assert_brute_force_lower_order_failures_preserve_route(
        graph, "C", ["G"], result.vertex_connectivity, 1
    )
    _assert_reported_cut_disconnects_all_gateways(
        graph, "C", ["G"], result.critical_satellites
    )


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
    _assert_reported_cut_disconnects_all_gateways(
        graph, "C", ["G"], result.critical_satellites
    )


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
    _assert_brute_force_lower_order_failures_preserve_route(
        graph, "C", ["G"], result.vertex_connectivity, 2
    )


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
    _assert_reported_cut_disconnects_all_gateways(
        graph, "C", ["G1", "G2"], result.critical_satellites
    )


def test_disconnected_client_has_zero_connectivity() -> None:
    graph = _graph([("S1", "G")])
    graph.add_node("C", kind="ground")

    result = compute_connectivity_margin(graph, "C", ["G"])

    assert result.vertex_connectivity == 0
    assert result.critical_satellites == []


def test_client_and_gateway_are_never_cut_candidates() -> None:
    graph = _graph([("C", "S1"), ("S1", "G")])
    # Even malformed endpoint metadata must not make endpoints eligible.
    graph.nodes["C"]["kind"] = "satellite"
    graph.nodes["G"]["kind"] = "satellite"

    result = compute_connectivity_margin(graph, "C", ["G"])

    assert result.vertex_connectivity == 1
    assert result.critical_satellites == ["S1"]
    assert "C" not in result.critical_satellites
    assert "G" not in result.critical_satellites


def test_result_is_deterministic_and_returns_one_minimum_cut_not_union() -> None:
    edges = [
        ("C", "S1"),
        ("C", "S2"),
        ("S1", "S3"),
        ("S1", "S4"),
        ("S2", "S3"),
        ("S2", "S4"),
        ("S3", "G"),
        ("S4", "G"),
    ]
    forward = compute_connectivity_margin(_graph(edges), "C", ["G"])
    reversed_order = compute_connectivity_margin(_graph(list(reversed(edges))), "C", ["G"])

    assert forward == reversed_order
    assert forward.vertex_connectivity == 2
    assert set(forward.critical_satellites) in ({"S1", "S2"}, {"S3", "S4"})
    assert set(forward.critical_satellites) != {"S1", "S2", "S3", "S4"}


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
    assert days[0]["no_route_pct"] == 0.0
    assert days[0]["margin_1_pct"] == 50.0
    assert days[0]["margin_2_pct"] == 50.0
    assert days[0]["margin_3_plus_pct"] == 0.0
    assert days[1]["minimum_vertex_connectivity"] == 0
    assert days[1]["mean_vertex_connectivity"] == 0.5
    assert days[1]["average_when_connected"] == 1.0
    assert days[1]["no_route_pct"] == 50.0
    assert days[1]["margin_1_pct"] == 50.0
    assert days[1]["margin_2_pct"] == 0.0
    assert days[1]["margin_3_plus_pct"] == 0.0
    assert days[1]["critical_satellites"] == [
        {
            "satellite_id": "S4",
            "critical_samples": 1,
            "critical_fraction": 0.5,
        }
    ]


def test_daily_average_when_connected_is_none_when_route_is_always_absent() -> None:
    scenario = {
        "environment": {"step_s": 60, "horizon_s": 120},
        "ground_sites": [
            {"id": "C", "role": "client"},
            {"id": "G", "role": "gateway"},
        ],
    }
    graph = _graph([("S1", "G")])
    graph.add_node("C", kind="ground")

    day = aggregate_daily_connectivity(scenario, [graph, graph], "C")[0]

    assert day["average_when_connected"] is None
    assert day["no_route_pct"] == 100.0


def _real_routing_graph(
    scenario: dict,
    client_id: str,
    t_s: float,
) -> tuple[nx.Graph, list[str]]:
    env = scenario["environment"]
    clients = sorted(
        site["id"] for site in scenario["ground_sites"] if site["role"] == "client"
    )
    gateways = sorted(
        site["id"] for site in scenario["ground_sites"] if site["role"] == "gateway"
    )
    snapshot = geometry_adapter.get_snapshot(scenario, t_s)
    full_graph = build_snapshot_graph(
        snapshot,
        ground_ids={site["id"] for site in scenario["ground_sites"]},
        isl_range_km=env["isl_range_km"],
        min_elevation_deg=env["min_elevation_deg"],
    )
    return build_client_routing_graph(full_graph, client_id, clients), gateways


def test_real_snapshots_with_margin_two_survive_every_single_failure() -> None:
    scenario = get_example("01_full_constellation")

    for t_s in (0, 21_600):
        graph, gateways = _real_routing_graph(scenario, "C70", t_s)
        result = compute_connectivity_margin(graph, "C70", gateways)
        assert result.vertex_connectivity >= 2
        _assert_brute_force_lower_order_failures_preserve_route(
            graph, "C70", gateways, result.vertex_connectivity, 1
        )
        _assert_reported_cut_disconnects_all_gateways(
            graph, "C70", gateways, result.critical_satellites
        )


def test_real_snapshot_with_margin_three_survives_every_pair_failure() -> None:
    scenario = get_example("01_full_constellation")
    graph, gateways = _real_routing_graph(scenario, "C72", 28_800)

    result = compute_connectivity_margin(graph, "C72", gateways)

    assert result.vertex_connectivity >= 3
    _assert_brute_force_lower_order_failures_preserve_route(
        graph, "C72", gateways, result.vertex_connectivity, 2
    )
    _assert_reported_cut_disconnects_all_gateways(
        graph, "C72", gateways, result.critical_satellites
    )
