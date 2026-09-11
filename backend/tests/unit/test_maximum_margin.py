"""Unit tests for the `maximum_margin` (widest-path) routing strategy and
the margin calculations it's built on."""

import networkx as nx
import pytest

from app.calculation.network.margins import ground_margin, isl_margin
from app.calculation.routing.router import compute_route


def _edge(graph: nx.Graph, a: str, b: str, margin: float, distance_km: float = 100) -> None:
    graph.add_edge(a, b, distance_km=distance_km, margin=margin)


# --- margin arithmetic -------------------------------------------------


def test_isl_margin_at_zero_distance_is_one() -> None:
    assert isl_margin(0.0, 3000.0) == 1.0


def test_isl_margin_at_range_limit_is_zero() -> None:
    assert isl_margin(3000.0, 3000.0) == 0.0


def test_isl_margin_beyond_range_clamps_to_zero() -> None:
    assert isl_margin(4000.0, 3000.0) == 0.0


def test_isl_margin_midpoint() -> None:
    assert isl_margin(1500.0, 3000.0) == pytest.approx(0.5)


def test_ground_margin_at_min_elevation_is_zero() -> None:
    assert ground_margin(10.0, 10.0) == 0.0


def test_ground_margin_at_zenith_is_one() -> None:
    assert ground_margin(90.0, 10.0) == 1.0


def test_ground_margin_below_threshold_clamps_to_zero() -> None:
    assert ground_margin(5.0, 10.0) == 0.0


def test_ground_margin_midpoint() -> None:
    assert ground_margin(50.0, 10.0) == pytest.approx(40 / 80)


# --- widest path selection ----------------------------------------------


def test_widest_path_prefers_larger_bottleneck_over_fewer_hops() -> None:
    graph = nx.Graph()
    # Direct 1-hop path has a weak link; a 2-hop detour is uniformly strong.
    _edge(graph, "C1", "GW", margin=0.1)
    _edge(graph, "C1", "S1", margin=0.9)
    _edge(graph, "S1", "GW", margin=0.9)

    result = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="maximum_margin")

    assert result.path == ["C1", "S1", "GW"]
    assert result.bottleneck_margin == pytest.approx(0.9)
    assert result.bottleneck_edge in {("C1", "S1"), ("S1", "C1")} or result.bottleneck_edge in {
        ("S1", "GW"),
        ("GW", "S1"),
    }


def test_tie_break_prefers_fewer_hops_when_bottleneck_equal() -> None:
    graph = nx.Graph()
    # Both paths achieve bottleneck margin 0.5; the direct path has fewer hops.
    _edge(graph, "C1", "GW", margin=0.5, distance_km=500)
    _edge(graph, "C1", "S1", margin=0.5, distance_km=100)
    _edge(graph, "S1", "GW", margin=0.9, distance_km=100)

    result = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="maximum_margin")

    assert result.path == ["C1", "GW"]
    assert result.hops == 1
    assert result.bottleneck_margin == pytest.approx(0.5)


def test_tie_break_prefers_shorter_distance_when_bottleneck_and_hops_equal() -> None:
    graph = nx.Graph()
    # Two 2-hop paths both bottleneck at 0.5; the S1 route is shorter.
    _edge(graph, "C1", "S1", margin=0.5, distance_km=100)
    _edge(graph, "S1", "GW", margin=0.9, distance_km=100)
    _edge(graph, "C1", "S2", margin=0.5, distance_km=400)
    _edge(graph, "S2", "GW", margin=0.9, distance_km=400)

    result = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="maximum_margin")

    assert result.path == ["C1", "S1", "GW"]
    assert result.total_distance_km == pytest.approx(200)


def test_maximum_margin_no_path_returns_empty() -> None:
    graph = nx.Graph()
    graph.add_node("C1")
    graph.add_node("GW")

    result = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="maximum_margin")

    assert result.path == []
    assert not result.has_route
    assert result.bottleneck_margin is None


def test_maximum_margin_is_deterministic() -> None:
    graph = nx.Graph()
    _edge(graph, "C1", "S1", margin=0.4, distance_km=100)
    _edge(graph, "S1", "S2", margin=0.6, distance_km=100)
    _edge(graph, "S2", "GW", margin=0.4, distance_km=100)
    _edge(graph, "C1", "S3", margin=0.4, distance_km=50)
    _edge(graph, "S3", "GW", margin=0.7, distance_km=50)

    results = [
        compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="maximum_margin")
        for _ in range(5)
    ]

    assert all(r.path == results[0].path for r in results)
    assert all(r.bottleneck_margin == results[0].bottleneck_margin for r in results)


def test_maximum_margin_picks_best_of_multiple_gateways() -> None:
    graph = nx.Graph()
    _edge(graph, "C1", "S1", margin=0.9, distance_km=100)
    _edge(graph, "S1", "GW_WEAK", margin=0.1, distance_km=100)
    _edge(graph, "S1", "GW_STRONG", margin=0.8, distance_km=100)

    result = compute_route(
        graph, "C1", ["GW_WEAK", "GW_STRONG"], t_s=0, routing_strategy="maximum_margin"
    )

    assert result.gateway_id == "GW_STRONG"
    assert result.bottleneck_margin == pytest.approx(0.8)
