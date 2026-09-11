"""Dynamic contact graph construction from a geometry snapshot.

A snapshot's `edges` list already represents every physically possible
contact at one instant (inter-satellite links and ground-to-satellite
links, restricted to active satellites) — see
`reference_geometry.snapshot`. This module only turns that edge list into
a NetworkX graph and enforces the one routing rule geometry.py does not
encode: ground client sites must never act as relays for another client's
traffic. It also attaches a normalized link `margin` to every edge (see
`margins.py`) for the `maximum_margin` routing strategy.
"""

from __future__ import annotations

from typing import Any

import networkx as nx

from app.calculation.network.margins import ground_margin, isl_margin


def build_snapshot_graph(
    snapshot: dict[str, Any],
    *,
    ground_ids: set[str],
    isl_range_km: float,
    min_elevation_deg: float,
) -> nx.Graph:
    """Build the full contact graph for one snapshot (all nodes/edges).

    Each edge carries `distance_km` (as returned by geometry) and a
    normalized `margin` in `[0, 1]` — computed from `isl_range_km` for
    satellite-satellite edges, or from the snapshot's own
    `elevation_deg[ground_id][satellite_id]` and `min_elevation_deg` for
    ground-satellite edges.
    """
    graph: nx.Graph = nx.Graph()
    for sat in snapshot["satellites"]:
        if sat["active"]:
            graph.add_node(sat["id"], kind="satellite")

    elevation_deg: dict[str, dict[str, float]] = snapshot.get("elevation_deg", {})

    for a, b, distance_km in snapshot["edges"]:
        a_is_ground = a in ground_ids
        b_is_ground = b in ground_ids
        if a_is_ground or b_is_ground:
            ground_id, satellite_id = (a, b) if a_is_ground else (b, a)
            elevation = elevation_deg.get(ground_id, {}).get(satellite_id)
            margin = ground_margin(elevation, min_elevation_deg) if elevation is not None else 0.0
        else:
            margin = isl_margin(distance_km, isl_range_km)
        graph.add_edge(a, b, distance_km=distance_km, margin=margin)
    return graph


def build_client_routing_graph(
    graph: nx.Graph, client_id: str, all_client_ids: list[str]
) -> nx.Graph:
    """Return a routing-safe view of `graph` for one client.

    Every OTHER client ground node is removed so it cannot be traversed as
    an intermediate relay — geometry.py has no notion of "client" vs
    "gateway" ground sites, so that distinction is enforced here.

    Returns a real copy rather than a `subgraph` view: routing (BFS,
    Dijkstra, the widest-path search) does many repeated attribute lookups
    per edge, and a view's extra indirection on every one of those lookups
    turned out to cost more than the copy it was meant to avoid — measured
    on the Monte Carlo path, which calls this thousands of times.
    """
    other_clients = [
        cid for cid in all_client_ids if cid != client_id and graph.has_node(cid)
    ]
    if not other_clients:
        return graph
    routing_graph = graph.copy()
    routing_graph.remove_nodes_from(other_clients)
    return routing_graph
