"""Dynamic contact graph construction from a geometry snapshot.

A snapshot's `edges` list already represents every physically possible
contact at one instant (inter-satellite links and ground-to-satellite
links, restricted to active satellites) — see
`reference_geometry.snapshot`. This module only turns that edge list into
a NetworkX graph and enforces the one routing rule geometry.py does not
encode: ground client sites must never act as relays for another client's
traffic.
"""

from __future__ import annotations

from typing import Any

import networkx as nx


def build_snapshot_graph(snapshot: dict[str, Any]) -> nx.Graph:
    """Build the full contact graph for one snapshot (all nodes/edges)."""
    graph: nx.Graph = nx.Graph()
    for sat in snapshot["satellites"]:
        if sat["active"]:
            graph.add_node(sat["id"], kind="satellite")
    for a, b, distance_km in snapshot["edges"]:
        graph.add_edge(a, b, distance_km=distance_km)
    return graph


def build_client_routing_graph(
    graph: nx.Graph, client_id: str, all_client_ids: list[str]
) -> nx.Graph:
    """Return a routing-safe view of `graph` for one client.

    Every OTHER client ground node is removed so it cannot be traversed as
    an intermediate relay — geometry.py has no notion of "client" vs
    "gateway" ground sites, so that distinction is enforced here.
    """
    other_clients = [
        cid for cid in all_client_ids if cid != client_id and graph.has_node(cid)
    ]
    if not other_clients:
        return graph
    routing_graph = graph.copy()
    routing_graph.remove_nodes_from(other_clients)
    return routing_graph
