"""Deployment sequence planning and minimum-constellation-size analysis.

Both questions share one expensive computation — "given a budget of N
active satellites, which N maximize worst-client availability?" — so both
are answered from a single **greedy constructive sweep** instead of two
separate searches.

Why greedy, not brute force: choosing the best N out of 48 satellites is
`C(48, N)` combinations — for N=24 that is ~10^13, obviously intractable.
A full local-search (simulated annealing, genetic search) would be more
thorough but is unjustified extra complexity for a monotone-ish coverage
problem: adding a relay satellite essentially only adds paths, so a greedy
"always add whichever remaining satellite most improves the worst client
right now" constructive sweep tracks the true optimum closely for this
class of problem, is `O(n^2)` exact evaluations (1128 for n=48, each a
full exact 720-step simulation — no approximation inside a step), and
gives an honest, fully-reproducible, deterministic answer. It is a
heuristic, not a proof of optimality — documented here and in
docs/deployment-planner.md, never dressed up as exact.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from statistics import fmean
from typing import Any

from app.calculation.optimization.configuration import (
    apply_plane_parameters,
    evaluate_configuration,
    plane_parameters,
)
from app.calculation.optimization.search import optimize
from app.calculation.resilience.failure_analysis import (
    _client_metrics,
    build_graph_timeline,
    compute_timeline,
)


def active_subset_scenario(scenario: dict[str, Any], active_ids: set[str]) -> dict[str, Any]:
    """A derived scenario where every satellite NOT in `active_ids` is
    marked failed for the entire horizon.

    This reuses `reference_geometry.py`'s own activity rule unchanged
    (`active = launch_batch <= launch_stage and id not in failed`, see
    `case_materials/calculation/geometry.py`) rather than inventing a new
    one: setting `launch_stage` to the maximum makes every satellite
    launch-eligible, and the complement of `active_ids` is failed for
    `[0, horizon_s)` — physically identical to "never launched", without
    touching launch batches or plane structure, so ANY subset size/
    composition can be tested, not just whole launch batches.
    """
    derived = copy.deepcopy(scenario)
    horizon_s = derived["environment"]["horizon_s"]
    all_ids = {sat["id"] for sat in derived["design"]["satellites"]}
    if not active_ids <= all_ids:
        raise ValueError("active_ids must be a subset of the scenario's satellites")
    derived["design"]["launch_stage"] = max(
        (sat["launch_batch"] for sat in derived["design"]["satellites"]), default=3
    )
    inactive_ids = all_ids - active_ids
    derived["failures"] = [
        {"satellite_id": sid, "start_s": 0, "end_s": horizon_s} for sid in sorted(inactive_ids)
    ]
    derived["meta"] = dict(derived.get("meta", {}))
    derived["meta"]["id"] = f"{derived['meta'].get('id', 'scenario')}__stage{len(active_ids)}"
    return derived


@dataclass
class SubsetEvaluation:
    active_satellite_ids: list[str]
    size: int
    planes: dict[str, int]
    clients: dict[str, dict[str, Any]]
    worst_availability: float
    mean_availability: float
    worst_max_outage_s: int
    route_churn: int
    target_feasible: bool


def evaluate_subset(
    scenario: dict[str, Any], active_ids: set[str], routing_strategy: str
) -> SubsetEvaluation:
    """Exact evaluation of one active-satellite subset — full 720-step
    simulation, same pipeline as `evaluate_configuration`, just scoped to
    a single derived scenario instead of a stress-profile dict."""
    derived = active_subset_scenario(scenario, active_ids)
    graphs = build_graph_timeline(derived)
    timeline = compute_timeline(derived, graphs, routing_strategy)
    clients: dict[str, dict[str, Any]] = {}
    route_churn = 0
    for client_id, records in sorted(timeline.items()):
        metrics = _client_metrics(derived, client_id, records)
        clients[client_id] = {
            "availability_percent": metrics.availability_percent,
            "max_outage_s": metrics.max_outage_s,
            "target_achieved": metrics.target_achieved,
        }
        route_churn += metrics.route_change_count
    planes: dict[str, int] = {}
    plane_by_satellite = {sat["id"]: sat["plane_id"] for sat in scenario["design"]["satellites"]}
    for sid in active_ids:
        planes[plane_by_satellite[sid]] = planes.get(plane_by_satellite[sid], 0) + 1

    availability_values = [c["availability_percent"] / 100.0 for c in clients.values()]
    return SubsetEvaluation(
        active_satellite_ids=sorted(active_ids),
        size=len(active_ids),
        planes=planes,
        clients=clients,
        worst_availability=min(availability_values),
        mean_availability=fmean(availability_values),
        worst_max_outage_s=max(c["max_outage_s"] for c in clients.values()),
        route_churn=route_churn,
        target_feasible=all(c["target_achieved"] for c in clients.values()),
    )


def greedy_sequence(
    scenario: dict[str, Any],
    routing_strategy: str,
    *,
    max_size: int | None = None,
    progress: Any = None,
) -> list[SubsetEvaluation]:
    """Build a nested sequence of active subsets, size 1..max_size, adding
    at each step whichever remaining satellite most improves worst-client
    availability right now (ties: better mean availability, then lowest
    satellite id — fully deterministic, no randomness anywhere)."""
    all_ids = sorted(sat["id"] for sat in scenario["design"]["satellites"])
    cap = max_size or len(all_ids)
    selected: list[str] = []
    remaining = list(all_ids)
    sequence: list[SubsetEvaluation] = []

    while remaining and len(selected) < cap:
        best_result: SubsetEvaluation | None = None
        best_id: str | None = None
        best_key: tuple[float, int, float, int, int, str] | None = None
        for candidate_id in remaining:
            trial_ids = set(selected) | {candidate_id}
            result = evaluate_subset(scenario, trial_ids, routing_strategy)
            plane_imbalance = (
                max(result.planes.values()) - min(result.planes.values())
                if result.planes
                else 0
            )
            # Priority: worst availability, then the documented tie-break
            # (A4): lower worst outage, higher mean availability, lower
            # route churn, smaller deviation from a balanced/canonical
            # per-plane structure — id last, only to stay deterministic.
            key = (
                -result.worst_availability,
                result.worst_max_outage_s,
                -result.mean_availability,
                result.route_churn,
                plane_imbalance,
                candidate_id,
            )
            if best_key is None or key < best_key:
                best_key = key
                best_result = result
                best_id = candidate_id
        assert best_result is not None and best_id is not None
        selected.append(best_id)
        remaining.remove(best_id)
        sequence.append(best_result)
        if progress:
            progress(len(sequence), cap, best_result)

    return sequence


@dataclass
class StagePlan:
    size: int
    subset: SubsetEvaluation
    refined: dict[str, Any] | None = None


def refine_stage(
    scenario: dict[str, Any],
    subset: SubsetEvaluation,
    routing_strategy: str,
    *,
    budget: int,
    seed: int,
) -> dict[str, Any]:
    """Optional second phase: fix the chosen active subset, then search
    RAAN/phase for it with the existing exact optimizer — reuses
    `search.optimize()`/`evaluate_configuration()` unchanged, just scoped
    to the derived subset scenario as a single stress profile."""
    derived = active_subset_scenario(scenario, set(subset.active_satellite_ids))
    baseline_parameters = plane_parameters(derived)
    variable_names = sorted(baseline_parameters)
    bounds = {name: (0.0, 360.0) for name in variable_names}

    def evaluator(parameters: dict[str, float], _bypass: bool) -> dict[str, Any]:
        return evaluate_configuration({"stage": derived}, parameters, routing_strategy)

    baseline = evaluator(baseline_parameters, False)
    result = optimize(
        baseline_parameters,
        variable_names,
        bounds,
        budget,
        seed,
        "differential_evolution",
        max(4, budget // 5),
        False,
        evaluator,
    )
    best = result["best"]
    return {
        "baseline_worst_availability": baseline["aggregates"]["worst_availability"],
        "refined_worst_availability": best["aggregates"]["worst_availability"],
        "parameters": best["parameters"],
        "target_feasible": best["aggregates"]["target_feasible"],
        "derived_scenario": apply_plane_parameters(derived, best["parameters"]),
        "evaluated": result["evaluated"],
    }


def minimum_size_for_target(
    sequence: list[SubsetEvaluation], target_availability: float
) -> int | None:
    """First size in the greedy sequence where EVERY client reaches
    `target_availability`, or None if the swept range never reaches it."""
    for evaluation in sequence:
        if evaluation.worst_availability >= target_availability:
            return evaluation.size
    return None
