"""Unit tests for the dynamic contact graph builder."""

import networkx as nx

from app.calculation.network.graph import build_client_routing_graph, build_snapshot_graph


def test_build_snapshot_graph_only_includes_active_satellites() -> None:
    # reference_geometry.snapshot() never emits an edge touching an inactive
    # satellite (its own active[i] & active[j] filter guarantees that), so a
    # realistic snapshot only ever references S1 here — S2 has no edges.
    snapshot = {
        "satellites": [
            {"id": "S1", "active": True},
            {"id": "S2", "active": False},
        ],
        "edges": [["C1", "S1", 500.0]],
    }
    graph = build_snapshot_graph(snapshot)

    assert graph.has_node("S1")
    assert set(graph.nodes) == {"S1", "C1"}


def test_ground_client_cannot_act_as_relay() -> None:
    """C1 - S1 - C2 - S2 - Gateway: routing C1 must never use C2 as a hop."""
    full_graph = nx.Graph()
    full_graph.add_edge("C1", "S1", distance_km=1)
    full_graph.add_edge("S1", "C2", distance_km=1)
    full_graph.add_edge("C2", "S2", distance_km=1)
    full_graph.add_edge("S2", "GW", distance_km=1)

    routing_graph = build_client_routing_graph(full_graph, "C1", ["C1", "C2"])

    assert not routing_graph.has_node("C2")
    assert not nx.has_path(routing_graph, "C1", "GW")


def test_build_client_routing_graph_keeps_own_client_and_satellites() -> None:
    full_graph = nx.Graph()
    full_graph.add_edge("C1", "S1", distance_km=1)
    full_graph.add_edge("S1", "GW", distance_km=1)
    full_graph.add_edge("C2", "S1", distance_km=1)

    routing_graph = build_client_routing_graph(full_graph, "C1", ["C1", "C2"])

    assert routing_graph.has_node("C1")
    assert routing_graph.has_node("S1")
    assert routing_graph.has_node("GW")
    assert nx.has_path(routing_graph, "C1", "GW")
