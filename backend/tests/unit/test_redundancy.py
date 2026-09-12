from __future__ import annotations

from typing import Any

from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.network.graph import build_client_routing_graph, build_snapshot_graph
from app.calculation.resilience.failure_analysis import build_graph_timeline
from app.calculation.resilience.redundancy import compute_redundancy, find_backup_path
from app.calculation.routing.router import compute_route
from app.services.scenario_service import get_example


def _primary_path(scenario: dict[str, Any], client_id: str, t_s: float) -> tuple[list[str], list[str]]:
    env = scenario["environment"]
    ground_ids = {g["id"] for g in scenario["ground_sites"]}
    snapshot = geometry_adapter.get_snapshot(scenario, t_s)
    full_graph = build_snapshot_graph(
        snapshot,
        ground_ids=ground_ids,
        isl_range_km=env["isl_range_km"],
        min_elevation_deg=env["min_elevation_deg"],
    )
    clients = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    gateways = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    client_graph = build_client_routing_graph(full_graph, client_id, clients)
    route = compute_route(client_graph, client_id, gateways, t_s, "minimum_hops")
    return route.path, gateways


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


def test_find_backup_path_is_node_disjoint_from_primary_when_it_exists() -> None:
    scenario = get_example("01_full_constellation")
    path, gateways = _primary_path(scenario, "C65", 0)
    assert path, "expected a route to exist at t=0 in the dense scenario"

    result = find_backup_path(scenario, "C65", gateways, 0, path)

    assert result.primary_path == path
    if result.backup_path is not None:
        primary_intermediate = set(path[1:-1])
        backup_intermediate = set(result.backup_path[1:-1])
        assert primary_intermediate.isdisjoint(backup_intermediate)
        assert result.backup_path[0] == "C65"
        assert result.backup_path[-1] in gateways


def test_find_backup_path_none_when_primary_has_no_intermediate_nodes() -> None:
    scenario = get_example("01_full_constellation")
    result = find_backup_path(scenario, "C65", ["G_TEST"], 0, ["C65", "G_TEST"])
    assert result.backup_path is None


def test_find_backup_path_agrees_with_compute_redundancy_over_a_slice() -> None:
    scenario = get_example("01_full_constellation")
    env = scenario["environment"]
    graphs = build_graph_timeline(scenario)[:15]
    stats = compute_redundancy(scenario, graphs, "minimum_hops")

    # Wherever compute_redundancy counted a backup for C65, find_backup_path
    # must independently find one too when re-run on the same instant.
    if stats["C65"].backup_path_percent > 0:
        found_any_backup = False
        for step in range(15):
            t_s = step * env["step_s"]
            path, gateways = _primary_path(scenario, "C65", t_s)
            if not path:
                continue
            result = find_backup_path(scenario, "C65", gateways, t_s, path)
            if result.backup_path is not None:
                found_any_backup = True
                break
        assert found_any_backup
