"""Route redundancy: not just "does a path exist" but "does an
independent backup exist too".

For every (client, timestep) with a route, the primary path's intermediate
satellite nodes (everything except the client and the gateway themselves —
those two endpoints are shared by definition) are removed from that
timestep's routing graph, and a second route is searched for. If one is
still found, the client had a genuinely independent backup at that
instant, not just "a route" — two configurations can have identical
availability while differing hugely in how exposed a single failure
leaves them (see docs/network-redundancy.md).

No composite score: three plain percentages per client
(`no_route_percent` + `single_path_percent` + `backup_path_percent` sum to
100), read directly, not blended into one number.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import networkx as nx

from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.network.graph import build_client_routing_graph, build_snapshot_graph
from app.calculation.resilience.failure_analysis import build_graph_timeline
from app.calculation.routing.router import compute_route
from app.calculation.routing.stability import attach_edge_expiry, compute_edge_expiry_steps


def _ids(scenario: dict[str, Any]) -> tuple[list[str], list[str]]:
    clients = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    gateways = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    return clients, gateways


@dataclass
class ClientRedundancyStats:
    client_id: str
    no_route_percent: float
    single_path_percent: float
    backup_path_percent: float
    steps_evaluated: int


def compute_redundancy(
    scenario: dict[str, Any], graphs: list[nx.Graph], routing_strategy: str
) -> dict[str, ClientRedundancyStats]:
    """One full pass, reusing already-built per-step contact graphs (does
    not recompute geometry) — roughly doubles routing cost versus a plain
    simulation, since every timestep with a route needs a second search."""
    env = scenario["environment"]
    clients, gateways = _ids(scenario)
    routing_graphs = (
        [graph.copy() for graph in graphs] if routing_strategy == "maximum_persistence" else graphs
    )
    if routing_strategy == "maximum_persistence":
        expiry = compute_edge_expiry_steps(routing_graphs)
        for graph, edge_expiry in zip(routing_graphs, expiry, strict=True):
            attach_edge_expiry(graph, edge_expiry)

    n_steps = len(routing_graphs)
    counts = {client: {"no_route": 0, "single": 0, "backup": 0} for client in clients}

    for step, full_graph in enumerate(routing_graphs):
        t_s = step * env["step_s"]
        for client in clients:
            client_graph = build_client_routing_graph(full_graph, client, clients)
            route = compute_route(client_graph, client, gateways, t_s, routing_strategy)
            if not route.has_route:
                counts[client]["no_route"] += 1
                continue
            intermediate_nodes = route.path[1:-1]
            if not intermediate_nodes:
                # No relay to remove (client and gateway would need a direct
                # link) — there is nothing to test independence against.
                counts[client]["single"] += 1
                continue
            alt_graph = client_graph.copy()
            alt_graph.remove_nodes_from(intermediate_nodes)
            alt_route = compute_route(alt_graph, client, gateways, t_s, routing_strategy)
            if alt_route.has_route:
                counts[client]["backup"] += 1
            else:
                counts[client]["single"] += 1

    return {
        client: ClientRedundancyStats(
            client_id=client,
            no_route_percent=counts[client]["no_route"] / n_steps * 100,
            single_path_percent=counts[client]["single"] / n_steps * 100,
            backup_path_percent=counts[client]["backup"] / n_steps * 100,
            steps_evaluated=n_steps,
        )
        for client in clients
    }


@dataclass
class PrimaryBackupRoute:
    client_id: str
    t_s: float
    primary_path: list[str]
    backup_path: list[str] | None


def find_backup_path(
    scenario: dict[str, Any],
    client_id: str,
    gateway_ids: list[str],
    t_s: float,
    primary_path: list[str],
) -> PrimaryBackupRoute:
    """On-demand backup search for one already-known primary path, at one
    instant — the same node-removal test `compute_redundancy` runs for
    every step of the whole horizon, but for a single (client, t_s) click,
    rebuilding one snapshot graph (cheap) instead of the full timeline.

    The backup search always uses minimum-hops connectivity, regardless of
    the primary route's own strategy: existence of a node-disjoint backup
    does not depend on which existing path was preferred, and computing a
    persistence-aware backup would require the full future graph lookahead
    that `compute_redundancy` only affords because it already holds the
    whole horizon in memory."""
    intermediate_nodes = primary_path[1:-1] if len(primary_path) >= 2 else []
    if not intermediate_nodes:
        return PrimaryBackupRoute(client_id=client_id, t_s=t_s, primary_path=primary_path, backup_path=None)

    env = scenario["environment"]
    ground_ids = {g["id"] for g in scenario["ground_sites"]}
    clients, _ = _ids(scenario)
    snapshot = geometry_adapter.get_snapshot(scenario, t_s)
    full_graph = build_snapshot_graph(
        snapshot,
        ground_ids=ground_ids,
        isl_range_km=env["isl_range_km"],
        min_elevation_deg=env["min_elevation_deg"],
    )
    client_graph = build_client_routing_graph(full_graph, client_id, clients)
    client_graph.remove_nodes_from(intermediate_nodes)
    alt_route = compute_route(client_graph, client_id, gateway_ids, t_s, "minimum_hops")
    return PrimaryBackupRoute(
        client_id=client_id,
        t_s=t_s,
        primary_path=primary_path,
        backup_path=alt_route.path if alt_route.has_route else None,
    )


def run_redundancy_analysis(scenario: dict[str, Any], routing_strategy: str) -> dict[str, Any]:
    """API-facing wrapper: builds the contact-graph timeline once, then
    returns plain dicts (not dataclasses) — the shape the FastAPI layer
    expects to return as-is."""
    graphs = build_graph_timeline(scenario)
    stats = compute_redundancy(scenario, graphs, routing_strategy)
    env = scenario["environment"]
    return {
        "scenario_id": scenario.get("meta", {}).get("id"),
        "scenario_title": scenario.get("meta", {}).get("title"),
        "routing_strategy": routing_strategy,
        "step_s": env["step_s"],
        "horizon_s": env["horizon_s"],
        "n_steps": env["horizon_s"] // env["step_s"],
        "clients": {client_id: asdict(client_stats) for client_id, client_stats in stats.items()},
    }
