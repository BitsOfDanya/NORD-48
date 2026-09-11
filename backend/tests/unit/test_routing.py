"""Unit tests for route computation over an already-built routing graph."""

import networkx as nx

from app.calculation.routing.router import compute_route


def _linear_graph() -> nx.Graph:
    graph = nx.Graph()
    graph.add_edge("C1", "S1", distance_km=100)
    graph.add_edge("S1", "S2", distance_km=200)
    graph.add_edge("S2", "GW", distance_km=100)
    return graph


def test_route_path_format() -> None:
    result = compute_route(_linear_graph(), "C1", ["GW"], t_s=120, routing_strategy="minimum_hops")

    assert result.has_route
    assert result.path == ["C1", "S1", "S2", "GW"]
    assert result.hops == 3
    assert result.total_distance_km == 400
    assert result.gateway_id == "GW"


def test_no_route_returns_empty_path() -> None:
    graph = nx.Graph()
    graph.add_node("C1")
    graph.add_node("GW")
    # No edges at all: client and gateway are isolated.
    result = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="minimum_hops")

    assert result.path == []
    assert not result.has_route
    assert result.gateway_id is None
    assert result.total_distance_km is None


def test_client_not_in_graph_returns_empty_path() -> None:
    graph = nx.Graph()
    graph.add_edge("S1", "GW", distance_km=10)
    result = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="minimum_hops")

    assert result.path == []


def test_minimum_distance_prefers_shorter_path_over_fewer_hops() -> None:
    graph = nx.Graph()
    # Two-hop path is long; three-hop path is short.
    graph.add_edge("C1", "S1", distance_km=1000)
    graph.add_edge("S1", "GW", distance_km=1000)
    graph.add_edge("C1", "S2", distance_km=10)
    graph.add_edge("S2", "S3", distance_km=10)
    graph.add_edge("S3", "GW", distance_km=10)

    by_hops = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="minimum_hops")
    by_distance = compute_route(graph, "C1", ["GW"], t_s=0, routing_strategy="minimum_distance")

    assert by_hops.hops == 2
    assert by_distance.hops == 3
    assert by_distance.total_distance_km == 30


def test_multiple_gateways_picks_best() -> None:
    graph = nx.Graph()
    graph.add_edge("C1", "S1", distance_km=10)
    graph.add_edge("S1", "GW_FAR", distance_km=1000)
    graph.add_edge("S1", "GW_NEAR", distance_km=10)

    result = compute_route(
        graph, "C1", ["GW_FAR", "GW_NEAR"], t_s=0, routing_strategy="minimum_distance"
    )

    assert result.gateway_id == "GW_NEAR"
