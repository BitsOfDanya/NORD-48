"""Routing over the per-timestep dynamic contact graph.

Two strategies:

- `minimum_hops` (default) — unweighted BFS shortest path.
- `minimum_distance` — Dijkstra shortest path, weight = `distance_km`.

Callers must pass a routing graph already produced by
`app.calculation.network.graph.build_client_routing_graph`, which excludes
every ground client node except the one being routed — this module has no
notion of "client" vs "gateway" itself, it just finds the best path from
`client_id` to whichever configured gateway is cheapest to reach.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import networkx as nx

RoutingStrategy = str  # "minimum_hops" | "minimum_distance"


@dataclass
class RouteResult:
    client_id: str
    t_s: float
    routing_strategy: str
    gateway_id: str | None
    path: list[str] = field(default_factory=list)
    hops: int = 0
    total_distance_km: float | None = None

    @property
    def has_route(self) -> bool:
        return bool(self.path)


def _path_distance(graph: nx.Graph, path: list[str]) -> float:
    return sum(
        graph[path[i]][path[i + 1]]["distance_km"] for i in range(len(path) - 1)
    )


def compute_route(
    routing_graph: nx.Graph,
    client_id: str,
    gateway_ids: list[str],
    t_s: float,
    routing_strategy: RoutingStrategy = "minimum_hops",
) -> RouteResult:
    """Find the best route from `client_id` to any reachable gateway.

    With multiple gateways, the one giving the smaller sort key (hops for
    `minimum_hops`, distance for `minimum_distance`) wins; ties break on
    gateway ID (gateways are visited in sorted order, first match kept).
    """
    if not routing_graph.has_node(client_id):
        return RouteResult(client_id, t_s, routing_strategy, gateway_id=None)

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
    return RouteResult(
        client_id=client_id,
        t_s=t_s,
        routing_strategy=routing_strategy,
        gateway_id=gateway_id,
        path=path,
        hops=hops,
        total_distance_km=distance,
    )
