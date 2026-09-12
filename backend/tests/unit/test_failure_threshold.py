from __future__ import annotations

import copy

import networkx as nx

from app.calculation.resilience import failure_threshold


def _toy_scenario() -> dict:
    return {
        "meta": {"id": "toy", "title": "Toy"},
        "environment": {
            "horizon_s": 20,
            "step_s": 10,
            "target_availability": 0.9,
        },
        "design": {
            "satellites": [
                {"id": sat, "plane_id": "P1"} for sat in ("S1", "S2", "S3")
            ]
        },
        "ground_sites": [
            {"id": "C", "role": "client"},
            {"id": "G", "role": "gateway"},
        ],
    }


def _toy_graphs() -> list[nx.Graph]:
    graph = nx.Graph()
    graph.add_nodes_from([("C", {"kind": "ground"}), ("G", {"kind": "ground"})])
    graph.add_nodes_from((sat, {"kind": "satellite"}) for sat in ("S1", "S2", "S3"))
    for sat in ("S1", "S2", "S3"):
        graph.add_edge("C", sat)
        graph.add_edge(sat, "G")
    return [graph, graph.copy()]


def test_pairs_are_unique_and_complete() -> None:
    pairs = failure_threshold.satellite_pairs(["S3", "S1", "S2", "S2"])
    assert pairs == [("S1", "S2"), ("S1", "S3"), ("S2", "S3")]


def test_exact_n2_toy_network_is_deterministic_and_immutable(monkeypatch) -> None:
    scenario = _toy_scenario()
    original = copy.deepcopy(scenario)
    monkeypatch.setattr(failure_threshold, "build_graph_timeline", lambda _scenario: _toy_graphs())
    first = failure_threshold.run_exact_n2(scenario, 0, 20, "minimum_hops")
    second = failure_threshold.run_exact_n2(scenario, 0, 20, "minimum_hops")
    assert scenario == original
    assert first["experiment"]["combinations_evaluated"] == 3
    assert first["threshold_found"] is False
    assert [row["satellite_ids"] for row in first["worst_pairs"]] == [
        row["satellite_ids"] for row in second["worst_pairs"]
    ]
    assert all(row["additional_pair_effect_pp"] == 0 for row in first["worst_pairs"])
    stats = first["pair_worst_availability_stats"]
    assert stats["combinations_evaluated"] == 3
    assert stats["target_survival_fraction"] == 1.0
    assert stats["min_percent"] == 100.0


def test_n2_finds_threshold_when_only_two_paths_exist(monkeypatch) -> None:
    scenario = _toy_scenario()
    graphs = _toy_graphs()
    for graph in graphs:
        graph.remove_node("S3")
    monkeypatch.setattr(failure_threshold, "build_graph_timeline", lambda _scenario: graphs)
    result = failure_threshold.run_exact_n2(scenario, 0, 20, "minimum_hops")
    assert result["failure_threshold"] == 2
    assert result["target_breaking_pairs_count"] == 1
    assert result["first_target_break"]["satellite_ids"] == ["S1", "S2"]
    assert result["first_target_break"]["additional_pair_effect_pp"] == 100.0
