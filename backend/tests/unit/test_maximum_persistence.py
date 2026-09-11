import networkx as nx

from app.calculation.routing.router import compute_route


def _edge(
    graph: nx.Graph,
    a: str,
    b: str,
    *,
    expiry: int,
    margin: float = 0.5,
    distance: float = 100,
) -> None:
    graph.add_edge(
        a,
        b,
        persistence_until_step=expiry,
        margin=margin,
        distance_km=distance,
    )


def _route(graph: nx.Graph):
    return compute_route(graph, "C", ["G"], 0, "maximum_persistence")


def test_prefers_more_persistent_path() -> None:
    graph = nx.Graph()
    _edge(graph, "C", "A", expiry=2)
    _edge(graph, "A", "G", expiry=2)
    _edge(graph, "C", "B", expiry=8)
    _edge(graph, "B", "G", expiry=8)
    assert _route(graph).path == ["C", "B", "G"]


def test_tie_by_hops() -> None:
    graph = nx.Graph()
    _edge(graph, "C", "G", expiry=5)
    _edge(graph, "C", "A", expiry=5)
    _edge(graph, "A", "G", expiry=5)
    assert _route(graph).path == ["C", "G"]


def test_tie_by_margin_then_distance() -> None:
    graph = nx.Graph()
    _edge(graph, "C", "A", expiry=5, margin=0.8, distance=200)
    _edge(graph, "A", "G", expiry=5, margin=0.8, distance=200)
    _edge(graph, "C", "B", expiry=5, margin=0.7, distance=10)
    _edge(graph, "B", "G", expiry=5, margin=0.7, distance=10)
    assert _route(graph).path == ["C", "A", "G"]

    graph["C"]["B"]["margin"] = 0.8
    graph["B"]["G"]["margin"] = 0.8
    assert _route(graph).path == ["C", "B", "G"]


def test_deterministic_no_path_and_end_horizon() -> None:
    graph = nx.Graph()
    _edge(graph, "C", "G", expiry=0)
    assert [_route(graph).path for _ in range(5)] == [["C", "G"]] * 5

    empty = nx.Graph()
    empty.add_nodes_from(["C", "G"])
    assert _route(empty).path == []
