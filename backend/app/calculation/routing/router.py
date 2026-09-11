"""Routing over the per-timestep dynamic contact graph.

Four strategies:

- `minimum_hops` (default) — unweighted BFS shortest path.
- `minimum_distance` — Dijkstra shortest path, weight = `distance_km`.
- `maximum_margin` — widest path: maximize the smallest per-edge `margin`
  along the route (see `app.calculation.network.margins`), i.e. push the
  route away from whichever single link is closest to physically dropping
  out. Deterministic tie-break: among all paths achieving the best
  possible bottleneck margin, prefer fewer hops, then shorter total
  distance.
- `maximum_persistence` — maximize the last future snapshot through which the
  exact same path exists, then prefer fewer hops, larger current bottleneck
  margin, and shorter distance.

Callers must pass a routing graph already produced by
`app.calculation.network.graph.build_client_routing_graph`, which excludes
every ground client node except the one being routed — this module has no
notion of "client" vs "gateway" itself, it just finds the best path from
`client_id` to whichever configured gateway is cheapest/widest to reach.

`minimum_hops` and `minimum_distance` select exactly the path they always
did — the two new strategies are purely additive. Every strategy additionally
reports the chosen path's bottleneck margin/edge as a diagnostic; this is
a cheap post-hoc scan over the already-chosen path, not a re-simulation.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

import networkx as nx

RoutingStrategy = str

_MARGIN_EPS = 1e-9


@dataclass
class RouteResult:
    client_id: str
    t_s: float
    routing_strategy: str
    gateway_id: str | None
    path: list[str] = field(default_factory=list)
    hops: int = 0
    total_distance_km: float | None = None
    bottleneck_margin: float | None = None
    bottleneck_edge: tuple[str, str] | None = None

    @property
    def has_route(self) -> bool:
        return bool(self.path)


def _path_distance(graph: nx.Graph, path: list[str]) -> float:
    return sum(
        graph[path[i]][path[i + 1]]["distance_km"] for i in range(len(path) - 1)
    )


def path_bottleneck(graph: nx.Graph, path: list[str]) -> tuple[float, tuple[str, str]] | None:
    """The weakest (lowest-margin) edge along an already-chosen path."""
    if len(path) < 2:
        return None
    best_margin = math.inf
    best_edge: tuple[str, str] | None = None
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        margin = graph[u][v]["margin"]
        if margin < best_margin:
            best_margin = margin
            best_edge = (u, v)
    assert best_edge is not None
    return best_margin, best_edge


def _widest_path_bottleneck(graph: nx.Graph, source: str, target: str) -> float | None:
    """Standard widest-path (maximin) Dijkstra: the best bottleneck margin
    achievable on any path from `source` to `target`."""
    if not graph.has_node(source) or not graph.has_node(target):
        return None
    best: dict[str, float] = {source: math.inf}
    visited: set[str] = set()
    heap: list[tuple[float, str]] = [(-math.inf, source)]
    while heap:
        neg_margin, node = heapq.heappop(heap)
        margin = -neg_margin
        if node in visited:
            continue
        visited.add(node)
        if node == target:
            return margin
        for neighbor in graph.neighbors(node):
            if neighbor in visited:
                continue
            candidate = min(margin, graph[node][neighbor]["margin"])
            if candidate > best.get(neighbor, -math.inf):
                best[neighbor] = candidate
                heapq.heappush(heap, (-candidate, neighbor))
    return best.get(target)


def _restricted_subgraph(graph: nx.Graph, min_margin: float) -> nx.Graph:
    """Edges with margin below the achievable bottleneck can never be part
    of an optimal widest path — dropping them turns "find the widest path"
    into a plain min-hops / min-distance search on what's left."""
    sub: nx.Graph = nx.Graph()
    sub.add_nodes_from(graph.nodes(data=True))
    for u, v, data in graph.edges(data=True):
        if data["margin"] >= min_margin - _MARGIN_EPS:
            sub.add_edge(u, v, **data)
    return sub


def _min_distance_path_with_exact_hops(
    graph: nx.Graph, source: str, target: str, hops: int
) -> tuple[list[str], float] | None:
    """Among walks of exactly `hops` edges from `source` to `target`, the
    one with the smallest total `distance_km`.

    Implemented as a per-(node, hop-count) DP rather than enumerating full
    simple paths — O(hops * edges), deterministic (neighbors visited in
    sorted order; ties broken on the lexicographically smaller predecessor).
    It does not forbid revisiting a node mid-walk, but since every edge
    weight here is strictly positive, a detour can never reduce total
    distance, so the minimizer is a simple path in practice for this
    satellite-mesh topology.
    """
    # history[h][node] = (best distance, predecessor) after exactly h hops
    history: list[dict[str, tuple[float, str | None]]] = [{source: (0.0, None)}]
    for _ in range(hops):
        frontier: dict[str, tuple[float, str | None]] = {}
        for node, (dist, _pred) in history[-1].items():
            for neighbor in sorted(graph.neighbors(node)):
                candidate = dist + graph[node][neighbor]["distance_km"]
                current = frontier.get(neighbor)
                if (
                    current is None
                    or candidate < current[0] - _MARGIN_EPS
                    or (abs(candidate - current[0]) <= _MARGIN_EPS and node < current[1])  # type: ignore[operator]
                ):
                    frontier[neighbor] = (candidate, node)
        history.append(frontier)
        if not frontier:
            return None

    final = history[-1].get(target)
    if final is None:
        return None
    total_distance = final[0]

    path = [target]
    node = target
    for h in range(hops, 0, -1):
        _, predecessor = history[h][node]
        assert predecessor is not None
        path.append(predecessor)
        node = predecessor
    path.reverse()
    return path, total_distance


def _compute_maximum_margin_route(
    routing_graph: nx.Graph, client_id: str, gateway_ids: list[str]
) -> tuple[str, list[str], int, float] | None:
    """Returns (gateway_id, path, hops, total_distance_km) for the widest
    path, already tie-broken by fewer hops then shorter distance."""
    if not routing_graph.has_node(client_id):
        return None

    best: tuple[float, int, float, str, list[str]] | None = None
    for gateway_id in sorted(gateway_ids):
        if not routing_graph.has_node(gateway_id):
            continue
        bottleneck = _widest_path_bottleneck(routing_graph, client_id, gateway_id)
        if bottleneck is None:
            continue

        subgraph = _restricted_subgraph(routing_graph, bottleneck)
        if not nx.has_path(subgraph, client_id, gateway_id):
            continue  # defensive: shouldn't happen given how `bottleneck` was derived
        hops = len(nx.shortest_path(subgraph, client_id, gateway_id)) - 1

        found = _min_distance_path_with_exact_hops(subgraph, client_id, gateway_id, hops)
        if found is None:
            continue
        path, distance = found

        # Maximize bottleneck, then minimize hops, then minimize distance.
        candidate = (bottleneck, -hops, -distance)
        if best is None or candidate > (best[0], -best[1], -best[2]):
            best = (bottleneck, hops, distance, gateway_id, path)

    if best is None:
        return None
    _, hops, distance, gateway_id, path = best
    return gateway_id, path, hops, distance


def _best_margin_path_with_exact_hops(
    graph: nx.Graph, source: str, target: str, hops: int
) -> tuple[list[str], float, float] | None:
    """Maximize bottleneck margin, then minimize distance, at exact hop count."""
    # state[node] = (margin, distance, path); the path tuple also makes exact ties stable.
    states: dict[str, tuple[float, float, tuple[str, ...]]] = {
        source: (math.inf, 0.0, (source,))
    }
    for _ in range(hops):
        following: dict[str, tuple[float, float, tuple[str, ...]]] = {}
        for node, (margin, distance, path) in states.items():
            for neighbor in sorted(graph.neighbors(node)):
                candidate = (
                    min(margin, graph[node][neighbor]["margin"]),
                    distance + graph[node][neighbor]["distance_km"],
                    path + (neighbor,),
                )
                current = following.get(neighbor)
                if current is None or (candidate[0], -candidate[1], tuple(reversed(candidate[2]))) > (
                    current[0], -current[1], tuple(reversed(current[2]))
                ):
                    following[neighbor] = candidate
        states = following
    found = states.get(target)
    if found is None:
        return None
    return list(found[2]), found[0], found[1]


def _compute_maximum_persistence_route(
    routing_graph: nx.Graph, client_id: str, gateway_ids: list[str]
) -> tuple[str, list[str], int, float] | None:
    """Exact longest-lived path using per-edge consecutive expiry steps."""
    if not routing_graph.has_node(client_id):
        return None
    best: tuple[int, int, float, float, str, list[str]] | None = None
    for gateway_id in sorted(gateway_ids):
        if not routing_graph.has_node(gateway_id):
            continue
        # Maximum possible common expiry is a widest-path problem.
        work = nx.Graph()
        work.add_nodes_from(routing_graph.nodes(data=True))
        for a, b, data in routing_graph.edges(data=True):
            work.add_edge(a, b, margin=float(data["persistence_until_step"]))
        expiry = _widest_path_bottleneck(work, client_id, gateway_id)
        if expiry is None:
            continue
        intersection = nx.Graph()
        intersection.add_nodes_from(routing_graph.nodes(data=True))
        for a, b, data in routing_graph.edges(data=True):
            if data["persistence_until_step"] >= int(expiry):
                intersection.add_edge(a, b, **data)
        hops = nx.shortest_path_length(intersection, client_id, gateway_id)
        found = _best_margin_path_with_exact_hops(
            intersection, client_id, gateway_id, hops
        )
        if found is None:
            continue
        path, margin, distance = found
        candidate = (int(expiry), -hops, margin, -distance, gateway_id, path)
        if best is None or candidate[:4] > best[:4]:
            best = candidate
    if best is None:
        return None
    _, neg_hops, _margin, neg_distance, gateway_id, path = best
    return gateway_id, path, -neg_hops, -neg_distance


def compute_route(
    routing_graph: nx.Graph,
    client_id: str,
    gateway_ids: list[str],
    t_s: float,
    routing_strategy: RoutingStrategy = "minimum_hops",
) -> RouteResult:
    """Find the best route from `client_id` to any reachable gateway.

    With multiple gateways for `minimum_hops`/`minimum_distance`, the one
    giving the smaller sort key (hops or distance) wins; ties break on
    gateway ID (gateways are visited in sorted order, first match kept).
    `maximum_margin` has its own gateway selection — see
    `_compute_maximum_margin_route`.
    """
    if not routing_graph.has_node(client_id):
        return RouteResult(client_id, t_s, routing_strategy, gateway_id=None)

    if routing_strategy == "maximum_margin":
        found = _compute_maximum_margin_route(routing_graph, client_id, gateway_ids)
        if found is None:
            return RouteResult(client_id, t_s, routing_strategy, gateway_id=None)
        gateway_id, path, hops, distance = found
    elif routing_strategy == "maximum_persistence":
        found = _compute_maximum_persistence_route(routing_graph, client_id, gateway_ids)
        if found is None:
            return RouteResult(client_id, t_s, routing_strategy, gateway_id=None)
        gateway_id, path, hops, distance = found
    else:
        best: tuple[float, int, str, list[str], float] | None = None
        for gateway_id in sorted(gateway_ids):
            if not routing_graph.has_node(gateway_id):
                continue
            if not nx.has_path(routing_graph, client_id, gateway_id):
                continue

            if routing_strategy == "minimum_distance":
                path = nx.dijkstra_path(routing_graph, client_id, gateway_id, weight="distance_km")
            else:
                path = nx.shortest_path(routing_graph, client_id, gateway_id)

            distance = _path_distance(routing_graph, path)
            hops = len(path) - 1
            sort_key = distance if routing_strategy == "minimum_distance" else float(hops)

            if best is None or sort_key < best[0]:
                best = (sort_key, hops, gateway_id, path, distance)

        if best is None:
            return RouteResult(client_id, t_s, routing_strategy, gateway_id=None)
        _, hops, gateway_id, path, distance = best

    bottleneck = path_bottleneck(routing_graph, path)
    return RouteResult(
        client_id=client_id,
        t_s=t_s,
        routing_strategy=routing_strategy,
        gateway_id=gateway_id,
        path=path,
        hops=hops,
        total_distance_km=distance,
        bottleneck_margin=bottleneck[0] if bottleneck else None,
        bottleneck_edge=bottleneck[1] if bottleneck else None,
    )
