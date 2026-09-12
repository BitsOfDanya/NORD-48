from __future__ import annotations

from app.calculation.resilience.failure_analysis import build_graph_timeline
from app.calculation.resilience.redundancy import compute_redundancy
from app.services.scenario_service import get_example


def test_redundancy_percentages_sum_to_100_and_are_bounded() -> None:
    scenario = get_example("01_full_constellation")
    graphs = build_graph_timeline(scenario)[:20]  # short slice keeps the test fast
    stats = compute_redundancy(scenario, graphs, "minimum_hops")

    assert set(stats.keys()) == {"C65", "C70", "C72"}
    for client_stats in stats.values():
        total = (
            client_stats.no_route_percent
            + client_stats.single_path_percent
            + client_stats.backup_path_percent
        )
        assert total == 100.0
        assert 0.0 <= client_stats.no_route_percent <= 100.0
        assert 0.0 <= client_stats.single_path_percent <= 100.0
        assert 0.0 <= client_stats.backup_path_percent <= 100.0
        assert client_stats.steps_evaluated == 20


def test_redundancy_does_not_mutate_input_graphs() -> None:
    scenario = get_example("01_full_constellation")
    graphs = build_graph_timeline(scenario)[:5]
    edge_counts_before = [graph.number_of_edges() for graph in graphs]
    node_counts_before = [graph.number_of_nodes() for graph in graphs]

    compute_redundancy(scenario, graphs, "minimum_hops")

    assert [g.number_of_edges() for g in graphs] == edge_counts_before
    assert [g.number_of_nodes() for g in graphs] == node_counts_before


def test_redundancy_isolated_client_has_no_route() -> None:
    # 04_link_range has a much shorter ISL range -> more frequent isolation,
    # a good check that no_route_percent can be meaningfully nonzero.
    scenario = get_example("04_link_range")
    graphs = build_graph_timeline(scenario)[:30]
    stats = compute_redundancy(scenario, graphs, "minimum_hops")
    assert any(s.no_route_percent > 0 for s in stats.values())
