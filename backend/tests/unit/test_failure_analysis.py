import copy

import networkx as nx
import pytest

from app.calculation.resilience import failure_analysis


def _graph() -> nx.Graph:
    graph = nx.Graph()
    graph.add_node("S1", kind="satellite")
    graph.add_node("S2", kind="satellite")
    graph.add_edge("C", "S1", distance_km=1.0, margin=0.5)
    graph.add_edge("S1", "G", distance_km=1.0, margin=0.5)
    graph.add_edge("C", "S2", distance_km=2.0, margin=0.5)
    graph.add_edge("S2", "G", distance_km=2.0, margin=0.5)
    return graph


def _scenario() -> dict:
    return {
        "meta": {"id": "toy", "title": "Toy"},
        "environment": {
            "horizon_s": 360,
            "step_s": 120,
            "target_availability": 0.9,
        },
        "ground_sites": [
            {"id": "C", "role": "client"},
            {"id": "G", "role": "gateway"},
        ],
        "design": {
            "satellites": [
                {"id": "S1", "plane_id": "P1"},
                {"id": "S2", "plane_id": "P1"},
            ]
        },
        "gateway_outages": [],
    }


def test_overlay_before_within_after_and_no_mutation() -> None:
    baseline = [_graph() for _ in range(3)]
    original_nodes = [set(graph.nodes) for graph in baseline]
    overlaid = failure_analysis.apply_failure_overlay(
        baseline, {"S1"}, 120, 240, 120
    )
    assert overlaid[0].has_node("S1")
    assert not overlaid[1].has_node("S1")
    assert overlaid[2].has_node("S1")
    assert [set(graph.nodes) for graph in baseline] == original_nodes


def test_overlay_supports_multiple_satellites() -> None:
    baseline = [_graph()]
    overlaid = failure_analysis.apply_failure_overlay(
        baseline, {"S1", "S2"}, 0, 120, 120
    )
    assert not overlaid[0].has_node("S1")
    assert not overlaid[0].has_node("S2")


@pytest.mark.parametrize("start,end", [(0, 0), (120, 120), (240, 120), (-1, 120), (0, 361)])
def test_invalid_interval(start: int, end: int) -> None:
    with pytest.raises(ValueError):
        failure_analysis.validate_interval(start, end, 360)


def test_full_horizon_failure_delta_target_and_diagnostics() -> None:
    scenario = _scenario()
    graphs = [_graph() for _ in range(3)]
    baseline = failure_analysis.compute_timeline(scenario, graphs, "minimum_hops")
    failed_graphs = failure_analysis.apply_failure_overlay(
        graphs, {"S1", "S2"}, 0, 360, 120
    )
    failed = failure_analysis.compute_timeline(
        scenario, failed_graphs, "minimum_hops"
    )
    result = failure_analysis.compare_timelines(
        scenario, baseline, failed, include_timeline=True
    )
    client = result["clients"][0]
    assert client["delta"]["availability_pp"] == -100
    assert client["baseline"]["target_reached"] is True
    assert client["failed"]["target_reached"] is False
    assert result["target_violations"] == ["C"]
    assert result["diagnostic_distribution"] == {"NO_VISIBLE_SATELLITE": 3}
    assert all(step["failure_induced"] for step in result["timeline_impact"]["C"])
    assert all(step["failed_reason"] == "NO_VISIBLE_SATELLITE" for step in result["timeline_impact"]["C"])
    assert all(step["failed_path"] == [] for step in result["timeline_impact"]["C"])


def test_n1_processes_each_satellite_once_reuses_baseline_and_is_deterministic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scenario = _scenario()
    graphs = [_graph() for _ in range(3)]
    original = copy.deepcopy(graphs)
    calls = 0

    def fake_build(_scenario: dict) -> list[nx.Graph]:
        nonlocal calls
        calls += 1
        return graphs

    monkeypatch.setattr(failure_analysis, "build_graph_timeline", fake_build)
    first = failure_analysis.run_n1_criticality(scenario, 0, 360, "minimum_hops")
    second = failure_analysis.run_n1_criticality(scenario, 0, 360, "minimum_hops")
    assert calls == 2  # exactly once per complete N-1 call, never per satellite
    assert [row["satellite_id"] for row in first["ranking"]] == ["S1", "S2"]
    assert first["ranking"] == second["ranking"]
    assert first["experiment"]["satellites_analyzed"] == 2
    assert [set(graph.nodes) for graph in graphs] == [set(graph.nodes) for graph in original]


def test_n1_known_toy_result_and_ranking_metrics(monkeypatch: pytest.MonkeyPatch) -> None:
    scenario = _scenario()
    graphs = []
    for _ in range(3):
        graph = _graph()
        graph.remove_edges_from([("C", "S2"), ("S2", "G")])
        graphs.append(graph)
    monkeypatch.setattr(
        failure_analysis, "build_graph_timeline", lambda _scenario: graphs
    )
    result = failure_analysis.run_n1_criticality(scenario, 0, 360, "minimum_hops")
    top = result["ranking"][0]
    assert top["satellite_id"] == "S1"
    assert top["target_violations_count"] == 1
    assert top["worst_client_availability_drop_pp"] == 100
    assert top["worst_client_availability_percent"] == 0
    assert top["failure_induced_outage_steps"] == 3
