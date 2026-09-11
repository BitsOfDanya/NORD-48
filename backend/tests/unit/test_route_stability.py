import networkx as nx
import pytest

from app.calculation.routing.stability import (
    compute_edge_expiry_steps,
    compute_route_strategy_metrics,
    route_lifetime_steps,
    route_segments,
)
from app.models.route import RouteRecord


def _graph(*edges: tuple[str, str]) -> nx.Graph:
    graph = nx.Graph()
    graph.add_edges_from(edges)
    return graph


def _record(t_s: int, path: list[str], margin: float = 0.2) -> RouteRecord:
    return RouteRecord(
        t_s=t_s,
        client_id="C",
        gateway_id="G" if path else None,
        strategy="minimum_hops",
        path=path,
        hops=max(0, len(path) - 1),
        bottleneck_margin=margin if path else None,
    )


def test_route_valid_one_step_when_edge_disappears() -> None:
    assert route_lifetime_steps(["C", "S", "G"], [_graph(("C", "S"), ("S", "G")), _graph()], 0) == 1


def test_route_valid_multiple_steps() -> None:
    graphs = [_graph(("C", "S"), ("S", "G")) for _ in range(3)]
    assert route_lifetime_steps(["C", "S", "G"], graphs, 0) == 3


def test_route_ends_when_satellite_fails_or_gateway_edge_disappears() -> None:
    graphs = [
        _graph(("C", "S"), ("S", "G")),
        _graph(("C", "S")),
        _graph(("C", "X"), ("X", "G")),
    ]
    assert route_lifetime_steps(["C", "S", "G"], graphs, 0) == 1


def test_route_lifetime_at_end_of_horizon() -> None:
    graphs = [_graph(), _graph(("C", "G"))]
    assert route_lifetime_steps(["C", "G"], graphs, 1) == 1


def test_no_route_has_zero_lifetime() -> None:
    assert route_lifetime_steps([], [_graph()], 0) == 0


def test_edge_expiry_is_consecutive_not_last_reappearance() -> None:
    graphs = [_graph(("A", "B")), _graph(), _graph(("A", "B"))]
    expiry = compute_edge_expiry_steps(graphs)
    assert expiry[0][("A", "B")] == 0
    assert expiry[2][("A", "B")] == 2


def test_route_change_segmentation_and_summary() -> None:
    records = [
        _record(0, ["C", "A", "G"], 0.1),
        _record(120, ["C", "A", "G"], 0.3),
        _record(240, ["C", "B", "G"], 0.5),
        _record(360, []),
        _record(480, ["C", "B", "G"], 0.7),
    ]
    segments = route_segments(records, 120, 600)
    assert [s.lifetime_s for s in segments] == [240, 120, 120]

    metrics = compute_route_strategy_metrics("C", records, 120, 600)
    assert metrics.mean_route_lifetime_s == 160
    assert metrics.median_route_lifetime_s == 120
    assert metrics.p05_route_lifetime_s == pytest.approx(120)
    assert metrics.route_change_count == 2
    assert metrics.availability == pytest.approx(0.8)
    assert metrics.max_outage_s == 120

