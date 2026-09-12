from __future__ import annotations

import networkx as nx

from app.calculation.resilience.connectivity_margin import (
    aggregate_daily_connectivity,
    compute_connectivity_margin,
)


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
    assert days[1]["minimum_vertex_connectivity"] == 0
    assert days[1]["mean_vertex_connectivity"] == 0.5
    assert days[1]["critical_satellites"] == [
        {
            "satellite_id": "S4",
            "critical_samples": 1,
            "critical_fraction": 0.5,
        }
    ]
