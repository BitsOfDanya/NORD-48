"""Exact N-2 threshold analysis over immutable baseline contact graphs."""

from __future__ import annotations

import itertools
import time
from typing import Any

from app.calculation.resilience.failure_analysis import build_graph_timeline, validate_interval


def satellite_pairs(satellite_ids: list[str]) -> list[tuple[str, str]]:
    return list(itertools.combinations(sorted(set(satellite_ids)), 2))


def _max_outage(flags: list[bool], step_s: int) -> int:
    longest = current = 0
    for available in flags:
        current = 0 if available else current + 1
        longest = max(longest, current)
    return longest * step_s


def _has_route(
    adjacency: dict[str, tuple[str, ...]],
    client: str,
    gateways: set[str],
    excluded: frozenset[str],
    other_clients: set[str],
) -> bool:
    if client not in adjacency or client in excluded:
        return False
    seen = set(excluded) | other_clients
    seen.discard(client)
    seen.add(client)
    stack = [client]
    while stack:
        node = stack.pop()
        for neighbour in adjacency.get(node, ()):
            if neighbour in seen:
                continue
            if neighbour in gateways:
                return True
            seen.add(neighbour)
            stack.append(neighbour)
    return False


def _availability_by_client(
    adjacencies: list[dict[str, tuple[str, ...]]],
    clients: list[str],
    gateways: set[str],
    excluded: frozenset[str],
    first_step: int,
    last_step: int,
) -> dict[str, list[bool]]:
    others = {client: set(clients) - {client} for client in clients}
    result: dict[str, list[bool]] = {client: [] for client in clients}
    for index, adjacency in enumerate(adjacencies):
        active_excluded = excluded if first_step <= index < last_step else frozenset()
        for client in clients:
            result[client].append(
                _has_route(adjacency, client, gateways, active_excluded, others[client])
            )
    return result


def _fractions(flags: dict[str, list[bool]]) -> dict[str, float]:
    return {client: sum(values) / len(values) for client, values in flags.items()}


def run_exact_n2(
    scenario: dict[str, Any], start_s: int, end_s: int, routing_strategy: str
) -> dict[str, Any]:
    """Check every active-satellite pair; routing strategy is retained for provenance.

    Availability and outage duration depend on path existence, so the result is
    exact for every supported deterministic strategy without recomputing weights.
    """
    started = time.perf_counter()
    env = scenario["environment"]
    validate_interval(start_s, end_s, env["horizon_s"])
    graphs = build_graph_timeline(scenario)
    adjacencies = [
        {node: tuple(sorted(graph.adj[node])) for node in graph.nodes}
        for graph in graphs
    ]
    clients = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    gateways = {g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"}
    first_step = max(0, (start_s + env["step_s"] - 1) // env["step_s"])
    last_step = min(len(graphs), (end_s + env["step_s"] - 1) // env["step_s"])
    satellites = sorted(
        {
            node
            for graph in graphs[first_step:last_step]
            for node, data in graph.nodes(data=True)
            if data.get("kind") == "satellite"
        }
    )
    pairs = satellite_pairs(satellites)
    baseline_flags = _availability_by_client(
        adjacencies, clients, gateways, frozenset(), first_step, last_step
    )
    baseline_availability = _fractions(baseline_flags)
    baseline_outages = {
        client: _max_outage(flags, env["step_s"])
        for client, flags in baseline_flags.items()
    }

    single_availability: dict[str, dict[str, float]] = {}
    single_rows: list[dict[str, Any]] = []
    for satellite in satellites:
        flags = _availability_by_client(
            adjacencies, clients, gateways, frozenset({satellite}), first_step, last_step
        )
        availability = _fractions(flags)
        single_availability[satellite] = availability
        drops = {
            client: (baseline_availability[client] - availability[client]) * 100
            for client in clients
        }
        single_rows.append(
            {
                "satellite_id": satellite,
                "target_violations_count": sum(
                    availability[client] < env["target_availability"]
                    for client in clients
                ),
                "worst_client_availability_drop_pp": max(drops.values()),
                "max_outage_increase_s": max(
                    _max_outage(flags[client], env["step_s"]) - baseline_outages[client]
                    for client in clients
                ),
                "affected_clients_count": sum(drop > 1e-12 for drop in drops.values()),
                "failure_induced_outage_steps": sum(
                    baseline and not failed
                    for client in clients
                    for baseline, failed in zip(
                        baseline_flags[client], flags[client], strict=True
                    )
                ),
            }
        )
    single_rows.sort(
        key=lambda row: (
            -row["target_violations_count"],
            -row["worst_client_availability_drop_pp"],
            -row["max_outage_increase_s"],
            -row["affected_clients_count"],
            -row["failure_induced_outage_steps"],
            row["satellite_id"],
        )
    )
    top_n1 = {row["satellite_id"] for row in single_rows[:10]}

    rows: list[dict[str, Any]] = []
    for satellite_a, satellite_b in pairs:
        failed_flags = _availability_by_client(
            adjacencies,
            clients,
            gateways,
            frozenset({satellite_a, satellite_b}),
            first_step,
            last_step,
        )
        availability = _fractions(failed_flags)
        worst_client = min(clients, key=lambda c: (availability[c], c))
        drops = {
            client: (baseline_availability[client] - availability[client]) * 100
            for client in clients
        }
        target_violations = [
            client for client in clients if availability[client] < env["target_availability"]
        ]
        max_outage_increase = max(
            _max_outage(failed_flags[client], env["step_s"]) - baseline_outages[client]
            for client in clients
        )
        induced_steps = sum(
            baseline and not failed
            for client in clients
            for baseline, failed in zip(
                baseline_flags[client], failed_flags[client], strict=True
            )
        )
        actual_drop = drops[worst_client]
        additive_drop = (
            (baseline_availability[worst_client] - single_availability[satellite_a][worst_client])
            + (baseline_availability[worst_client] - single_availability[satellite_b][worst_client])
        ) * 100
        affected = [client for client in clients if drops[client] > 1e-12]
        rows.append(
            {
                "satellite_ids": [satellite_a, satellite_b],
                "worst_client_id": worst_client,
                "worst_client_availability": availability[worst_client],
                "worst_client_availability_percent": availability[worst_client] * 100,
                "availability_drop_pp": actual_drop,
                "target_violations_count": len(target_violations),
                "target_violations": target_violations,
                "max_outage_increase_s": max_outage_increase,
                "failure_induced_outage_steps": induced_steps,
                "affected_clients": affected,
                "additional_pair_effect_pp": actual_drop - additive_drop,
                "top_n1_endpoint_count": sum(s in top_n1 for s in (satellite_a, satellite_b)),
                "clients": [
                    {
                        "client_id": client,
                        "baseline_availability": baseline_availability[client],
                        "failed_availability": availability[client],
                        "availability_drop_pp": drops[client],
                    }
                    for client in clients
                ],
            }
        )

    rows.sort(
        key=lambda row: (
            -row["target_violations_count"],
            row["worst_client_availability"],
            -row["max_outage_increase_s"],
            tuple(row["satellite_ids"]),
        )
    )
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    breaking = [row for row in rows if row["target_violations_count"] > 0]
    endpoint_total = sum(row["top_n1_endpoint_count"] for row in rows[:20])
    return {
        "experiment": {
            "scenario_id": scenario.get("meta", {}).get("id"),
            "scenario_title": scenario.get("meta", {}).get("title"),
            "analysis_start_s": start_s,
            "analysis_end_s": end_s,
            "routing_strategy": routing_strategy,
            "step_s": env["step_s"],
            "horizon_s": env["horizon_s"],
            "satellites_analyzed": len(satellites),
            "combinations_evaluated": len(pairs),
            "baseline_geometry_runs": 1,
        },
        "baseline": {
            "clients": baseline_availability,
            "worst_availability": min(baseline_availability.values()),
        },
        "threshold_found": bool(breaking),
        "failure_threshold": 2 if breaking else None,
        "threshold_label": "2" if breaking else "> 2",
        "target_breaking_pairs_count": len(breaking),
        "first_target_break": breaking[0] if breaking else None,
        "worst_pairs": rows[:20],
        "n1": {
            "combinations_evaluated": len(single_rows),
            "target_breaking_count": sum(
                any(value < env["target_availability"] for value in availability.values())
                for availability in single_availability.values()
            ),
            "top_10_satellites": [row["satellite_id"] for row in single_rows[:10]],
        },
        "n1_n2_correlation": {
            "top_20_pair_endpoints": 40 if len(rows) >= 20 else len(rows) * 2,
            "endpoints_in_top_10_n1": endpoint_total,
        },
        "benchmark": {"runtime_s": time.perf_counter() - started},
    }
