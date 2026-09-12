"""Deployment sequence planning and minimum-constellation-size analysis.

Both questions share one expensive computation — "given a budget of N
active satellites, which N maximize worst-client availability?" — so both
start from a single **greedy constructive sweep**. Requested sizes can then
be improved by exact best-improvement 1-swap and bounded tabu search before
the existing RAAN/phase refinement.

Why greedy, not brute force: choosing the best N out of 48 satellites is
`C(48, N)` combinations — for N=24 that is ~10^13, obviously intractable.
The greedy sweep is `O(n^2)` exact evaluations (1128 for n=48, each a full
exact 720-step simulation).  The optional local phase keeps cardinality
fixed and evaluates only one-for-one exchanges.  Both phases are heuristics,
not proofs of global optimality; their search logic is approximate but every
candidate score still comes from the exact simulator.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from statistics import fmean
from typing import Any

import numpy as np

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


def subset_rank_key(evaluation: SubsetEvaluation) -> tuple[Any, ...]:
    """Lexicographic deployment objective; lower is better."""
    plane_counts = list(evaluation.planes.values())
    plane_imbalance = max(plane_counts) - min(plane_counts) if plane_counts else 0
    return (
        -evaluation.worst_availability,
        evaluation.worst_max_outage_s,
        -evaluation.mean_availability,
        evaluation.route_churn,
        plane_imbalance,
        tuple(evaluation.active_satellite_ids),
    )


@dataclass
class SubsetLocalSearchResult:
    """Result and audit trail for the greedy -> 1-swap -> tabu pipeline."""

    initial: SubsetEvaluation
    best: SubsetEvaluation
    one_swap_passes_completed: int
    one_swap_evaluations: int
    tabu_iterations_completed: int
    tabu_evaluations: int
    improvement: float
    seed: int


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
    planes: dict[str, int] = {plane["id"]: 0 for plane in scenario["design"]["planes"]}
    plane_by_satellite = {sat["id"]: sat["plane_id"] for sat in scenario["design"]["satellites"]}
    for sid in active_ids:
        planes[plane_by_satellite[sid]] += 1

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
            # Use the same objective as the local-search refinement so a
            # candidate never changes meaning between phases.
            key = (*subset_rank_key(result)[:-1], candidate_id)
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


def refine_subset_local_search(
    scenario: dict[str, Any],
    initial: SubsetEvaluation,
    routing_strategy: str,
    *,
    one_swap_passes: int,
    tabu_iterations: int,
    tabu_candidates_per_iteration: int,
    tabu_tenure: int,
    seed: int,
) -> SubsetLocalSearchResult:
    """Improve a fixed-cardinality subset with exact 1-swap and tabu search.

    The first phase performs deterministic best-improvement passes over the
    complete one-for-one exchange neighbourhood.  The second phase samples a
    bounded, seeded set of exchanges per iteration and may move through a
    worse solution; the best solution seen is retained.  Tabu membership is
    attached to satellite IDs that were just exchanged, with aspiration for
    a new global best.
    """
    if one_swap_passes < 0 or tabu_iterations < 0:
        raise ValueError("local-search iteration counts must be non-negative")
    if tabu_candidates_per_iteration < 1 or tabu_tenure < 1:
        raise ValueError("tabu candidates and tenure must be positive")

    all_ids = sorted(sat["id"] for sat in scenario["design"]["satellites"])
    if initial.size in {0, len(all_ids)}:
        return SubsetLocalSearchResult(initial, initial, 0, 0, 0, 0, 0.0, seed)

    current = initial
    best = initial
    one_swap_evaluations = 0
    completed_passes = 0

    for _pass in range(one_swap_passes):
        selected = current.active_satellite_ids
        remaining = sorted(set(all_ids) - set(selected))
        best_neighbor = current
        for removed in selected:
            base = set(selected) - {removed}
            for added in remaining:
                candidate = evaluate_subset(scenario, base | {added}, routing_strategy)
                one_swap_evaluations += 1
                if subset_rank_key(candidate) < subset_rank_key(best_neighbor):
                    best_neighbor = candidate
        completed_passes += 1
        if subset_rank_key(best_neighbor) >= subset_rank_key(current):
            break
        current = best_neighbor
        if subset_rank_key(current) < subset_rank_key(best):
            best = current

    rng = np.random.default_rng(seed)
    tabu_until: dict[str, int] = {}
    tabu_evaluations = 0
    completed_tabu_iterations = 0

    for iteration in range(tabu_iterations):
        selected = current.active_satellite_ids
        remaining = sorted(set(all_ids) - set(selected))
        moves = [(removed, added) for removed in selected for added in remaining]
        if not moves:
            break
        order = rng.permutation(len(moves))[: min(tabu_candidates_per_iteration, len(moves))]
        chosen: tuple[SubsetEvaluation, str, str] | None = None
        for index in order:
            removed, added = moves[int(index)]
            candidate = evaluate_subset(
                scenario, (set(selected) - {removed}) | {added}, routing_strategy
            )
            tabu_evaluations += 1
            is_tabu = (
                tabu_until.get(removed, -1) > iteration or tabu_until.get(added, -1) > iteration
            )
            aspiration = subset_rank_key(candidate) < subset_rank_key(best)
            if is_tabu and not aspiration:
                continue
            if chosen is None or subset_rank_key(candidate) < subset_rank_key(chosen[0]):
                chosen = (candidate, removed, added)
        if chosen is None:
            break
        current, removed, added = chosen
        tabu_until[removed] = iteration + tabu_tenure
        tabu_until[added] = iteration + tabu_tenure
        completed_tabu_iterations += 1
        if subset_rank_key(current) < subset_rank_key(best):
            best = current

    return SubsetLocalSearchResult(
        initial=initial,
        best=best,
        one_swap_passes_completed=completed_passes,
        one_swap_evaluations=one_swap_evaluations,
        tabu_iterations_completed=completed_tabu_iterations,
        tabu_evaluations=tabu_evaluations,
        improvement=best.worst_availability - initial.worst_availability,
        seed=seed,
    )


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


def _rank_key(evaluation: SubsetEvaluation) -> tuple[float, int, float, int, int]:
    imbalance = (
        max(evaluation.planes.values()) - min(evaluation.planes.values())
        if evaluation.planes
        else 0
    )
    return (
        -evaluation.worst_availability,
        evaluation.worst_max_outage_s,
        -evaluation.mean_availability,
        evaluation.route_churn,
        imbalance,
    )


@dataclass
class SwapRefinementResult:
    start: SubsetEvaluation
    result: SubsetEvaluation
    swaps_applied: list[tuple[str, str]]
    evaluations: int


def swap_refine(
    scenario: dict[str, Any],
    active_ids: set[str],
    routing_strategy: str,
    *,
    max_passes: int = 3,
    progress: Any = None,
) -> SwapRefinementResult:
    """Local search around a candidate subset: each pass tries every
    single active-satellite <-> inactive-satellite swap, exact-evaluates
    it, and keeps the single BEST-improving swap found (steepest descent,
    not first-improvement) — deterministic given a fixed candidate.

    Bounded cost: one pass is `len(active) * len(inactive)` exact
    evaluations (e.g. 44*4=176 for N=44), capped at `max_passes` — stops
    early the moment a pass finds no improving swap (a local optimum),
    which is the common case since the starting point is already the
    output of a greedy search. Existing simulations aren't reused between
    trials (each swap changes which satellites are active, so the contact
    graph differs) — this is still exact, just not free; see
    docs/design-threshold-verification.md for measured runtime.
    """
    all_ids = sorted(sat["id"] for sat in scenario["design"]["satellites"])
    current = set(active_ids)
    current_eval = evaluate_subset(scenario, current, routing_strategy)
    start_eval = current_eval
    swaps: list[tuple[str, str]] = []
    evaluations = 1

    for pass_index in range(max_passes):
        best_key = _rank_key(current_eval)
        best_swap: tuple[str, str] | None = None
        best_eval = current_eval
        inactive = sorted(sid for sid in all_ids if sid not in current)
        for out_id in sorted(current):
            for in_id in inactive:
                trial_ids = (current - {out_id}) | {in_id}
                trial_eval = evaluate_subset(scenario, trial_ids, routing_strategy)
                evaluations += 1
                key = _rank_key(trial_eval)
                if key < best_key:
                    best_key = key
                    best_eval = trial_eval
                    best_swap = (out_id, in_id)
        if progress:
            progress(pass_index + 1, max_passes, best_eval, best_swap is not None)
        if best_swap is None:
            break
        current = (current - {best_swap[0]}) | {best_swap[1]}
        current_eval = best_eval
        swaps.append(best_swap)

    return SwapRefinementResult(
        start=start_eval, result=current_eval, swaps_applied=swaps, evaluations=evaluations
    )


@dataclass
class ThresholdPoint:
    size: int
    greedy: SubsetEvaluation
    refined: SwapRefinementResult
    target_feasible: bool


def verify_threshold(
    scenario: dict[str, Any],
    sequence: list[SubsetEvaluation],
    sizes: list[int],
    routing_strategy: str,
    target_availability: float,
    *,
    max_passes: int = 3,
    progress: Any = None,
) -> list[ThresholdPoint]:
    """For each requested size, take the greedy sequence's candidate at
    that size (already the best single-satellite-at-a-time construction)
    and apply local swap refinement — a materially different search
    (multi-satellite exchange, not just addition order) run independently
    at each size, not derived from one another. Raises this analysis's
    confidence above a single greedy pass without full brute force.
    """
    by_size = {evaluation.size: evaluation for evaluation in sequence}
    points: list[ThresholdPoint] = []
    for index, size in enumerate(sorted(set(sizes))):
        if size not in by_size:
            raise ValueError(f"size {size} is not in the supplied greedy sequence")
        refined = swap_refine(
            scenario,
            set(by_size[size].active_satellite_ids),
            routing_strategy,
            max_passes=max_passes,
        )
        points.append(
            ThresholdPoint(
                size=size,
                greedy=by_size[size],
                refined=refined,
                target_feasible=refined.result.worst_availability >= target_availability,
            )
        )
        if progress:
            progress(index + 1, len(sizes), points[-1])
    return points


def first_verified_pass(points: list[ThresholdPoint]) -> int | None:
    """First size (ascending) where the REFINED result reaches target —
    the number to report as "first PASS found by this search", never as a
    proven global minimum (see docs/design-threshold-verification.md)."""
    for point in sorted(points, key=lambda p: p.size):
        if point.target_feasible:
            return point.size
    return None


def marginal_gain_curve(sequence: list[SubsetEvaluation]) -> list[dict[str, Any]]:
    """Δ worst-availability (percentage points) from adding the N-th
    satellite to the N-1-th — diminishing (or occasionally jumping)
    returns, read directly rather than folded into a single score."""
    curve: list[dict[str, Any]] = []
    previous = 0.0
    for evaluation in sorted(sequence, key=lambda e: e.size):
        gain_pp = (evaluation.worst_availability - previous) * 100
        curve.append(
            {
                "size": evaluation.size,
                "worst_availability_percent": evaluation.worst_availability * 100,
                "marginal_gain_pp": gain_pp,
            }
        )
        previous = evaluation.worst_availability
    return curve


def target_margin_pp(worst_availability: float, target_availability: float) -> float:
    """`worst_availability - target_availability`, in percentage points.
    Positive = spare margin above target; negative = short of it. Not a
    score — a plain, signed distance to the one number the case sets."""
    return (worst_availability - target_availability) * 100
