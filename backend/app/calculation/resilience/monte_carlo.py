"""Monte Carlo resilience stress-testing.

This does **not** model a per-satellite failure probability — the case
data doesn't provide one (see `docs/resilience-analysis.md`). Instead each
trial asks a narrower, data-supported question: *if exactly K satellites
from the deployed fleet were unavailable for the whole horizon, which K,
chosen uniformly at random, would hurt the network the most or least?*
That's a synthetic stress test over random K-satellite combinations, not a
statistical reliability estimate.

Reuses the existing exact pipeline unmodified: `reference_geometry`
positions/contacts, the same dynamic graph builder, the same routing
strategies (including `maximum_margin`), the same diagnostics. No ML, no
approximation — this is exact graph computation repeated across random
trials.

Performance: orbital geometry (`reference_geometry.snapshot`) is computed
once per timestep for the whole horizon and reused across every trial —
random failures never move a satellite, they only remove graph nodes, so
re-running geometry per trial would be pure waste. See `_precompute_snapshots`.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

import networkx as nx
import numpy as np

from app.calculation.diagnostics.diagnostics import diagnose
from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.network.graph import build_client_routing_graph, build_snapshot_graph
from app.calculation.routing.router import compute_route

MAX_ITERATIONS = 1000


@dataclass
class ClientStrategyStats:
    client_id: str
    mean: float
    std: float
    min: float
    max: float
    p05: float
    p50: float
    p95: float
    target_success_fraction: float
    mean_max_outage_s: float
    p95_max_outage_s: float


@dataclass
class StrategySummary:
    strategy: str
    per_client: list[ClientStrategyStats]
    mean_worst_client_availability: float
    median_worst_client_availability: float
    p05_worst_client_availability: float
    p10_worst_client_availability: float
    min_worst_client_availability: float
    all_clients_target_fraction: float


@dataclass
class TrialDetail:
    trial_index: int
    failed_satellites: list[str]
    worst_client_id: str
    worst_client_availability: float
    diagnostic_breakdown: dict[str, int]


@dataclass
class MonteCarloResult:
    scenario_id: str | None
    scenario_title: str | None
    failed_satellites_count: int
    requested_failed_satellites_count: int
    iterations: int
    seed: int
    step_s: int
    horizon_s: int
    n_steps: int
    target_availability: float
    client_ids: list[str]
    gateway_ids: list[str]
    candidate_satellite_count: int
    strategies: list[StrategySummary] = field(default_factory=list)
    recommended_strategy: str = ""
    recommended_reason: str = ""
    worst_trial: TrialDetail | None = None
    best_trial: TrialDetail | None = None


def _percentile(values: list[float], q: float) -> float:
    return float(np.percentile(np.asarray(values, dtype=float), q))


def _precompute_snapshots(scenario: dict[str, Any], step_s: int, n_steps: int) -> list[dict]:
    """Every geometry snapshot for the horizon, computed once. Immutable —
    every trial below only reads from these dicts, never mutates them."""
    return [geometry_adapter.get_snapshot(scenario, step * step_s) for step in range(n_steps)]


def _candidate_satellite_ids(scenario: dict[str, Any]) -> list[str]:
    """Satellites that exist at the scenario's launch stage — the pool
    Monte Carlo draws additional random failures from."""
    launch_stage = scenario["design"]["launch_stage"]
    return sorted(
        sat["id"] for sat in scenario["design"]["satellites"] if sat["launch_batch"] <= launch_stage
    )


def _precompute_base_graphs(
    snapshots: list[dict], graph_params: dict[str, Any]
) -> list[nx.Graph]:
    """One contact graph per timestep, built once and reused by every
    trial — random failures never move a satellite or change a contact's
    distance/margin, they only remove graph nodes. Rebuilding the graph
    from raw geometry for every trial would recompute the exact same
    edges hundreds of times for nothing."""
    return [build_snapshot_graph(snapshot, **graph_params) for snapshot in snapshots]


def _apply_failures(base_graph: nx.Graph, failed_satellites: set[str]) -> nx.Graph:
    """`base_graph` with the failed nodes removed, on a copy — never
    mutates the shared base graph, which every other trial still needs.

    A `subgraph` view was tried here first (skip the copy, filter nodes on
    read instead): it made the full K=5/100-trial run *slower*, not
    faster — every routing call does many repeated per-edge attribute
    lookups, and a view's extra indirection on each of those outweighed
    the copy it was meant to avoid. Reusing `base_graph` across trials
    (never re-deriving it from geometry) is what actually pays off — see
    `_precompute_base_graphs`.
    """
    if not failed_satellites:
        return base_graph
    present = failed_satellites & base_graph.nodes
    if not present:
        return base_graph
    graph = base_graph.copy()
    graph.remove_nodes_from(present)
    return graph


def _simulate_trial(
    base_graphs: list[nx.Graph],
    failed_satellites: set[str],
    client_ids: list[str],
    all_client_ids: list[str],
    gateway_ids: list[str],
    strategies: list[str],
    step_s: int,
) -> dict[str, dict[str, tuple[float, int]]]:
    """Run one trial's full horizon for every (strategy, client). Returns
    `{strategy: {client_id: (availability_fraction, max_outage_s)}}`.

    Only aggregate counters are kept in memory — not per-step route
    records — so this scales to hundreds of trials without ballooning.
    """
    n_steps = len(base_graphs)
    available_count = {s: dict.fromkeys(client_ids, 0) for s in strategies}
    current_run = {s: dict.fromkeys(client_ids, 0) for s in strategies}
    max_run = {s: dict.fromkeys(client_ids, 0) for s in strategies}

    for step in range(n_steps):
        t_s = step * step_s
        full_graph = _apply_failures(base_graphs[step], failed_satellites)

        for client_id in client_ids:
            routing_graph = build_client_routing_graph(full_graph, client_id, all_client_ids)
            for strategy in strategies:
                route = compute_route(routing_graph, client_id, gateway_ids, t_s, strategy)
                if route.has_route:
                    available_count[strategy][client_id] += 1
                    current_run[strategy][client_id] = 0
                else:
                    current_run[strategy][client_id] += 1
                    max_run[strategy][client_id] = max(
                        max_run[strategy][client_id], current_run[strategy][client_id]
                    )

    return {
        strategy: {
            client_id: (
                available_count[strategy][client_id] / n_steps,
                max_run[strategy][client_id] * step_s,
            )
            for client_id in client_ids
        }
        for strategy in strategies
    }


def _diagnostic_breakdown(
    base_graphs: list[nx.Graph],
    scenario: dict[str, Any],
    failed_satellites: set[str],
    client_id: str,
    all_client_ids: list[str],
    gateway_ids: list[str],
    strategy: str,
    step_s: int,
) -> dict[str, int]:
    """Re-run a single (trial, client, strategy) to tally *why* routes were
    missing — only done for the worst/best headline trial, not every trial."""
    counts: Counter[str] = Counter()
    for step, base_graph in enumerate(base_graphs):
        t_s = step * step_s
        full_graph = _apply_failures(base_graph, failed_satellites)

        routing_graph = build_client_routing_graph(full_graph, client_id, all_client_ids)
        route = compute_route(routing_graph, client_id, gateway_ids, t_s, strategy)
        if not route.has_route:
            diagnosis = diagnose(full_graph, scenario, client_id, gateway_ids, t_s)
            counts[diagnosis.reason] += 1
    return dict(counts)


def _recommend_strategy(strategies: list[StrategySummary]) -> tuple[str, str]:
    """Deterministic rule, no ML — see docs/resilience-analysis.md.

    1. highest `all_clients_target_fraction`;
    2. tie -> highest `p05_worst_client_availability`;
    3. tie -> highest `mean_worst_client_availability`;
    4. tie -> prefer `minimum_hops` (simplest strategy) over the others.
    """
    strategy_priority = {"minimum_hops": 0, "minimum_distance": 1, "maximum_margin": 2}

    def sort_key(s: StrategySummary) -> tuple[float, float, float, int]:
        return (
            s.all_clients_target_fraction,
            s.p05_worst_client_availability,
            s.mean_worst_client_availability,
            -strategy_priority.get(s.strategy, 99),
        )

    best = max(strategies, key=sort_key)

    reasons = [f"доля экспериментов, где все пункты достигли цели: {best.all_clients_target_fraction:.1%}"]
    ties_on_first = [s for s in strategies if s.all_clients_target_fraction == best.all_clients_target_fraction]
    if len(ties_on_first) > 1:
        reasons.append(f"P5 худшего пункта: {best.p05_worst_client_availability:.1%}")
        ties_on_second = [
            s for s in ties_on_first if s.p05_worst_client_availability == best.p05_worst_client_availability
        ]
        if len(ties_on_second) > 1:
            reasons.append(f"средняя доступность худшего пункта: {best.mean_worst_client_availability:.1%}")
            ties_on_third = [
                s
                for s in ties_on_second
                if s.mean_worst_client_availability == best.mean_worst_client_availability
            ]
            if len(ties_on_third) > 1:
                reasons.append("равные результаты — выбрана более простая стратегия")

    return best.strategy, "; ".join(reasons)


def run_monte_carlo(
    scenario: dict[str, Any],
    failed_satellites_count: int,
    iterations: int,
    seed: int,
    strategies: list[str],
    client_ids: list[str] | None = None,
) -> MonteCarloResult:
    env = scenario["environment"]
    step_s = env["step_s"]
    horizon_s = env["horizon_s"]
    n_steps = horizon_s // step_s
    target_availability = env["target_availability"]

    all_client_ids = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    gateway_ids = sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    analyzed_clients = sorted(client_ids) if client_ids else all_client_ids

    graph_params = {
        "ground_ids": {g["id"] for g in scenario["ground_sites"]},
        "isl_range_km": env["isl_range_km"],
        "min_elevation_deg": env["min_elevation_deg"],
    }

    candidates = _candidate_satellite_ids(scenario)
    requested_k = failed_satellites_count
    k = max(0, min(failed_satellites_count, len(candidates)))

    snapshots = _precompute_snapshots(scenario, step_s, n_steps)
    base_graphs = _precompute_base_graphs(snapshots, graph_params)

    rng = np.random.default_rng(seed)
    candidates_array = np.array(candidates)

    # Per (strategy, client): one availability_fraction / max_outage_s per trial.
    avail: dict[str, dict[str, list[float]]] = {
        s: {c: [] for c in analyzed_clients} for s in strategies
    }
    outage: dict[str, dict[str, list[int]]] = {
        s: {c: [] for c in analyzed_clients} for s in strategies
    }
    worst_client_avail: dict[str, list[float]] = {s: [] for s in strategies}
    all_target_flags: dict[str, list[bool]] = {s: [] for s in strategies}
    failed_sets: list[list[str]] = []

    for _trial in range(iterations):
        failed = (
            set(rng.choice(candidates_array, size=k, replace=False).tolist()) if k > 0 else set()
        )
        failed_sets.append(sorted(failed))

        trial_result = _simulate_trial(
            base_graphs,
            failed,
            analyzed_clients,
            all_client_ids,
            gateway_ids,
            strategies,
            step_s,
        )

        for strategy in strategies:
            worst = 1.0
            all_meet_target = True
            for client_id in analyzed_clients:
                fraction, max_outage_s = trial_result[strategy][client_id]
                avail[strategy][client_id].append(fraction)
                outage[strategy][client_id].append(max_outage_s)
                worst = min(worst, fraction)
                if fraction < target_availability:
                    all_meet_target = False
            worst_client_avail[strategy].append(worst)
            all_target_flags[strategy].append(all_meet_target)

    strategy_summaries: list[StrategySummary] = []
    for strategy in strategies:
        per_client_stats: list[ClientStrategyStats] = []
        for client_id in analyzed_clients:
            values = avail[strategy][client_id]
            outages = outage[strategy][client_id]
            per_client_stats.append(
                ClientStrategyStats(
                    client_id=client_id,
                    mean=float(np.mean(values)),
                    std=float(np.std(values)),
                    min=float(np.min(values)),
                    max=float(np.max(values)),
                    p05=_percentile(values, 5),
                    p50=_percentile(values, 50),
                    p95=_percentile(values, 95),
                    target_success_fraction=sum(v >= target_availability for v in values)
                    / len(values),
                    mean_max_outage_s=float(np.mean(outages)),
                    p95_max_outage_s=_percentile([float(o) for o in outages], 95),
                )
            )

        strategy_summaries.append(
            StrategySummary(
                strategy=strategy,
                per_client=per_client_stats,
                mean_worst_client_availability=float(np.mean(worst_client_avail[strategy])),
                median_worst_client_availability=_percentile(worst_client_avail[strategy], 50),
                p05_worst_client_availability=_percentile(worst_client_avail[strategy], 5),
                p10_worst_client_availability=_percentile(worst_client_avail[strategy], 10),
                min_worst_client_availability=float(np.min(worst_client_avail[strategy])),
                all_clients_target_fraction=sum(all_target_flags[strategy]) / iterations,
            )
        )

    recommended_strategy, recommended_reason = _recommend_strategy(strategy_summaries)

    worst_idx = int(np.argmin(worst_client_avail[recommended_strategy]))
    best_idx = int(np.argmax(worst_client_avail[recommended_strategy]))

    def _trial_detail(trial_index: int) -> TrialDetail:
        failed = set(failed_sets[trial_index])
        worst_client = min(
            analyzed_clients, key=lambda c: avail[recommended_strategy][c][trial_index]
        )
        worst_value = avail[recommended_strategy][worst_client][trial_index]
        breakdown = _diagnostic_breakdown(
            base_graphs,
            scenario,
            failed,
            worst_client,
            all_client_ids,
            gateway_ids,
            recommended_strategy,
            step_s,
        )
        return TrialDetail(
            trial_index=trial_index,
            failed_satellites=failed_sets[trial_index],
            worst_client_id=worst_client,
            worst_client_availability=worst_value,
            diagnostic_breakdown=breakdown,
        )

    return MonteCarloResult(
        scenario_id=scenario.get("meta", {}).get("id"),
        scenario_title=scenario.get("meta", {}).get("title"),
        failed_satellites_count=k,
        requested_failed_satellites_count=requested_k,
        iterations=iterations,
        seed=seed,
        step_s=step_s,
        horizon_s=horizon_s,
        n_steps=n_steps,
        target_availability=target_availability,
        client_ids=analyzed_clients,
        gateway_ids=gateway_ids,
        candidate_satellite_count=len(candidates),
        strategies=strategy_summaries,
        recommended_strategy=recommended_strategy,
        recommended_reason=recommended_reason,
        worst_trial=_trial_detail(worst_idx),
        best_trial=_trial_detail(best_idx),
    )
