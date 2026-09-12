"""CVaR and adversarial optimization for exactly-K satellite outages.

One orbital geometry is built per angle candidate.  Every failure case is
then an exact node-removal overlay on that shared graph timeline, avoiding a
full geometry rebuild for every member of the failure bank.
"""

from __future__ import annotations

import copy
import math
import time
from dataclasses import asdict, dataclass
from statistics import fmean
from typing import Any

import numpy as np

from app.calculation.optimization.configuration import (
    _parameter_deviation,
    apply_plane_parameters,
    canonical_parameters,
    plane_parameters,
)
from app.calculation.optimization.search import optimize
from app.calculation.resilience.failure_analysis import (
    _client_metrics,
    apply_failure_overlay,
    build_graph_timeline,
    compute_timeline,
)


@dataclass(frozen=True)
class FailureCase:
    case_id: str
    satellite_ids: tuple[str, ...]
    kind: str


def lower_tail_cvar(values: list[float], alpha: float) -> float:
    """Mean of the lowest ``alpha`` probability mass (larger is better)."""
    if not values:
        raise ValueError("CVaR requires at least one value")
    if not 0.0 < alpha <= 1.0:
        raise ValueError("cvar_alpha must be in (0, 1]")
    ordered = sorted(float(value) for value in values)
    mass = alpha * len(ordered)
    whole = int(math.floor(mass))
    fraction = mass - whole
    total = sum(ordered[:whole])
    if fraction > 1e-12:
        total += ordered[whole] * fraction
    return total / mass


def _eligible_satellites(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    stage = scenario["design"]["launch_stage"]
    return [sat for sat in scenario["design"]["satellites"] if sat["launch_batch"] <= stage]


def _unique_case(cases: list[FailureCase], seen: set[tuple[str, ...]], case: FailureCase) -> None:
    if case.satellite_ids not in seen:
        seen.add(case.satellite_ids)
        cases.append(case)


def build_failure_bank(
    normal_scenario: dict[str, Any],
    fixed_failure_scenario: dict[str, Any],
    *,
    failure_count: int,
    random_samples: int,
    correlated_samples: int,
    seed: int,
) -> tuple[list[FailureCase], int, int]:
    """Fixed case plus seeded uniform and same-plane adjacent-slot cases."""
    eligible = _eligible_satellites(normal_scenario)
    eligible_ids = sorted(sat["id"] for sat in eligible)
    if failure_count < 1 or failure_count > len(eligible_ids):
        raise ValueError("failure_count must fit the deployed satellite fleet")

    fixed_failures = fixed_failure_scenario.get("failures", [])
    fixed_ids = tuple(sorted({failure["satellite_id"] for failure in fixed_failures}))
    if len(fixed_ids) != failure_count:
        raise ValueError(
            f"fixed failure profile contains {len(fixed_ids)} satellites, expected {failure_count}"
        )
    if not fixed_failures:
        raise ValueError("fixed failure profile must contain satellite failures")
    if not set(fixed_ids) <= set(eligible_ids):
        raise ValueError("fixed failure profile contains satellites outside the deployed fleet")
    start_s = int(min(failure["start_s"] for failure in fixed_failures))
    end_s = int(max(failure["end_s"] for failure in fixed_failures))
    if end_s > normal_scenario["environment"]["horizon_s"]:
        raise ValueError("fixed failure interval exceeds the normal scenario horizon")

    cases: list[FailureCase] = []
    seen: set[tuple[str, ...]] = set()
    fixed_profile = str(fixed_failure_scenario.get("meta", {}).get("id", "fixed_failure"))
    _unique_case(cases, seen, FailureCase(fixed_profile, fixed_ids, "fixed"))

    rng = np.random.default_rng(seed)
    ids_array = np.asarray(eligible_ids)
    attempts = 0
    while (
        sum(case.kind == "random" for case in cases) < random_samples
        and attempts < random_samples * 20 + 20
    ):
        attempts += 1
        chosen = tuple(sorted(rng.choice(ids_array, size=failure_count, replace=False).tolist()))
        before = len(cases)
        _unique_case(cases, seen, FailureCase(f"random_{len(cases):03d}", chosen, "random"))
        if len(cases) == before:
            continue

    by_plane: dict[str, list[dict[str, Any]]] = {}
    for satellite in eligible:
        by_plane.setdefault(satellite["plane_id"], []).append(satellite)
    windows: list[tuple[str, ...]] = []
    for plane_id in sorted(by_plane):
        ordered = sorted(
            by_plane[plane_id], key=lambda satellite: (satellite["slot_deg"], satellite["id"])
        )
        ids = [satellite["id"] for satellite in ordered]
        if len(ids) < failure_count:
            continue
        for start in range(len(ids)):
            windows.append(
                tuple(sorted(ids[(start + offset) % len(ids)] for offset in range(failure_count)))
            )
    # Interleave planes/start positions deterministically instead of taking
    # every requested case from the first plane.
    windows = sorted(set(windows), key=lambda item: tuple((sid[1:]) for sid in item))
    if windows and correlated_samples:
        indices = np.linspace(
            0, len(windows) - 1, num=min(correlated_samples, len(windows)), dtype=int
        )
        for index in indices:
            chosen = windows[int(index)]
            _unique_case(
                cases,
                seen,
                FailureCase(f"correlated_{len(cases):03d}", chosen, "correlated"),
            )

    return cases, start_s, end_s


def _scenario_row(
    scenario: dict[str, Any],
    graphs: list[Any],
    routing_strategy: str,
    *,
    profile: str,
    scenario_id: str,
    failure_count: int,
    start_index: int = 0,
    end_index: int | None = None,
) -> dict[str, Any]:
    timeline = compute_timeline(scenario, graphs, routing_strategy)
    clients: list[dict[str, Any]] = []
    for client_id, records in sorted(timeline.items()):
        metrics = _client_metrics(scenario, client_id, records[start_index:end_index])
        clients.append(
            {
                "client_id": client_id,
                "availability": metrics.availability_fraction,
                "availability_percent": metrics.availability_percent,
                "max_outage_s": metrics.max_outage_s,
                "route_change_count": metrics.route_change_count,
                "mean_hops": metrics.average_hops,
                "target_reached": metrics.target_achieved,
            }
        )
    return {
        "profile": profile,
        "scenario_id": scenario_id,
        "isl_range_km": scenario["environment"]["isl_range_km"],
        "failure_count": failure_count,
        "clients": clients,
        "worst_availability": min(client["availability"] for client in clients),
        "target_violations": sum(not client["target_reached"] for client in clients),
        "evaluation_start_s": start_index * scenario["environment"]["step_s"],
        "evaluation_end_s": (
            end_index * scenario["environment"]["step_s"]
            if end_index is not None
            else scenario["environment"]["horizon_s"]
        ),
    }


def evaluate_failure_configuration(
    normal_scenario: dict[str, Any],
    parameters: dict[str, float],
    failure_cases: list[FailureCase],
    routing_strategy: str,
    *,
    failure_start_s: int,
    failure_end_s: int,
    cvar_alpha: float,
    baseline_parameters: dict[str, float],
) -> dict[str, Any]:
    """Evaluate normal service and the post-failure window of every bank case."""
    derived = apply_plane_parameters(normal_scenario, parameters)
    derived["failures"] = []
    base_graphs = build_graph_timeline(derived)
    step_s = derived["environment"]["step_s"]
    start_index = math.ceil(failure_start_s / step_s)
    end_index = math.ceil(failure_end_s / step_s)
    normal_profile = str(normal_scenario.get("meta", {}).get("id", "normal"))

    normal_row = _scenario_row(
        derived,
        base_graphs,
        routing_strategy,
        profile=normal_profile,
        scenario_id=normal_profile,
        failure_count=0,
    )
    failure_rows: list[dict[str, Any]] = []
    for case in failure_cases:
        failed_graphs = apply_failure_overlay(
            base_graphs, set(case.satellite_ids), failure_start_s, failure_end_s, step_s
        )
        failure_rows.append(
            _scenario_row(
                derived,
                failed_graphs,
                routing_strategy,
                profile=case.case_id,
                scenario_id=case.case_id,
                failure_count=len(case.satellite_ids),
                start_index=start_index,
                end_index=end_index,
            )
        )

    rows = [normal_row, *failure_rows]
    all_clients = [client for row in rows for client in row["clients"]]
    failure_scores = [row["worst_availability"] for row in failure_rows]
    normal_feasible = normal_row["target_violations"] == 0
    cvar = lower_tail_cvar(failure_scores, cvar_alpha)
    return {
        "parameters": dict(sorted(parameters.items())),
        "scenarios": rows,
        "aggregates": {
            "worst_availability": min(failure_scores),
            "mean_availability": fmean(client["availability"] for client in all_clients),
            "worst_max_outage_s": max(client["max_outage_s"] for client in all_clients),
            "mean_max_outage_s": fmean(client["max_outage_s"] for client in all_clients),
            "route_churn": sum(client["route_change_count"] for client in all_clients),
            "target_violations": sum(not client["target_reached"] for client in all_clients),
            "conditions": len(all_clients),
            "target_feasible": normal_feasible,
            "parameter_deviation_deg": _parameter_deviation(parameters, baseline_parameters),
        },
        "failure_robust": {
            "cvar_alpha": cvar_alpha,
            "cvar_availability": cvar,
            "worst_availability": min(failure_scores),
            "mean_case_worst_availability": fmean(failure_scores),
            "normal_worst_availability": normal_row["worst_availability"],
            "normal_target_feasible": normal_feasible,
            "failure_start_s": failure_start_s,
            "failure_end_s": failure_end_s,
            "bank_size": len(failure_cases),
            "case_scores": {
                case.case_id: row["worst_availability"]
                for case, row in zip(failure_cases, failure_rows, strict=True)
            },
        },
    }


def failure_cvar_scalar(candidate: dict[str, Any], target_availability: float) -> float:
    """Two-tier scalar: protect normal target, then maximize lower-tail CVaR."""
    normal = candidate["scenarios"][0]
    shortfall = sum(
        max(0.0, target_availability - client["availability"]) for client in normal["clients"]
    )
    if shortfall > 0:
        return 1.0 + shortfall
    return 1.0 - candidate["failure_robust"]["cvar_availability"]


def failure_cvar_rank_key(candidate: dict[str, Any], target_availability: float) -> tuple[Any, ...]:
    robust = candidate["failure_robust"]
    return (
        failure_cvar_scalar(candidate, target_availability),
        -robust["worst_availability"],
        candidate["aggregates"]["worst_max_outage_s"],
        -robust["normal_worst_availability"],
        candidate["aggregates"]["parameter_deviation_deg"],
        canonical_parameters(candidate["parameters"]),
    )


def find_adversarial_failure_case(
    normal_scenario: dict[str, Any],
    parameters: dict[str, float],
    failure_cases: list[FailureCase],
    routing_strategy: str,
    *,
    failure_count: int,
    failure_start_s: int,
    failure_end_s: int,
    budget: int,
    seed: int,
    case_id: str,
    known_scores: dict[str, float] | None = None,
) -> tuple[FailureCase | None, dict[str, Any]]:
    """Tabu-guided one-swap search for a damaging novel exactly-K set."""
    if budget <= 0:
        return None, {"evaluated": 0, "reason": "budget_zero"}
    derived = apply_plane_parameters(normal_scenario, parameters)
    derived["failures"] = []
    base_graphs = build_graph_timeline(derived)
    step_s = derived["environment"]["step_s"]
    start_index = math.ceil(failure_start_s / step_s)
    end_index = math.ceil(failure_end_s / step_s)
    all_ids = sorted(sat["id"] for sat in _eligible_satellites(derived))
    known_sets = {case.satellite_ids for case in failure_cases}
    rng = np.random.default_rng(seed)
    cache: dict[tuple[str, ...], tuple[float, int]] = {}
    if known_scores:
        for case in failure_cases:
            if case.case_id in known_scores:
                cache[case.satellite_ids] = (known_scores[case.case_id], 0)

    def score(ids: tuple[str, ...]) -> tuple[float, int]:
        if ids not in cache:
            graphs = apply_failure_overlay(
                base_graphs, set(ids), failure_start_s, failure_end_s, step_s
            )
            row = _scenario_row(
                derived,
                graphs,
                routing_strategy,
                profile="adversarial_candidate",
                scenario_id="adversarial_candidate",
                failure_count=failure_count,
                start_index=start_index,
                end_index=end_index,
            )
            cache[ids] = (
                row["worst_availability"],
                max(client["max_outage_s"] for client in row["clients"]),
            )
        return cache[ids]

    # Start from the bank's currently worst case when available; otherwise
    # use a seeded random exactly-K set.
    starts = list(known_sets)
    if starts:
        current = min(starts, key=lambda ids: (*score(ids), ids))
    else:
        current = tuple(
            sorted(rng.choice(np.asarray(all_ids), size=failure_count, replace=False).tolist())
        )
        score(current)
    evaluated_before_search = len(cache)
    best_novel: tuple[str, ...] | None = None
    tabu_until: dict[str, int] = {}
    iteration = 0

    # Spend up to half the budget on a criticality-greedy construction.
    # Partial failure sets are exact evaluations too; this seed captures
    # interaction effects instead of merely concatenating an N-1 ranking.
    criticality_budget = min(budget // 2, budget - 1)
    if criticality_budget >= failure_count:
        critical: set[str] = set()
        per_step = max(1, criticality_budget // failure_count)
        for _step in range(failure_count):
            available = sorted(set(all_ids) - critical)
            sample_size = min(per_step, len(available))
            sampled = rng.choice(np.asarray(available), size=sample_size, replace=False).tolist()
            candidate_sets = [tuple(sorted(critical | {str(sid)})) for sid in sampled]
            chosen = min(candidate_sets, key=lambda ids: (*score(ids), ids))
            critical = set(chosen)
        critical_seed = tuple(sorted(critical))
        if (*score(critical_seed), critical_seed) < (*score(current), current):
            current = critical_seed
        if critical_seed not in known_sets:
            best_novel = critical_seed

    while len(cache) - evaluated_before_search < budget and iteration < budget * 10 + 10:
        selected = list(current)
        remaining = sorted(set(all_ids) - set(selected))
        use_double_swap = iteration % 3 == 2 and len(selected) >= 2 and len(remaining) >= 2
        moves: list[tuple[tuple[str, ...], tuple[str, ...]]] = []
        if use_double_swap:
            desired = min(16, budget - (len(cache) - evaluated_before_search))
            seen_moves: set[tuple[tuple[str, ...], tuple[str, ...]]] = set()
            attempts = 0
            while len(moves) < desired and attempts < desired * 10 + 10:
                attempts += 1
                removed = tuple(
                    sorted(rng.choice(np.asarray(selected), size=2, replace=False).tolist())
                )
                added = tuple(
                    sorted(rng.choice(np.asarray(remaining), size=2, replace=False).tolist())
                )
                move = (removed, added)
                if move not in seen_moves:
                    seen_moves.add(move)
                    moves.append(move)
        else:
            moves = [((removed,), (added,)) for removed in selected for added in remaining]
        if not moves:
            break
        remaining_budget = budget - (len(cache) - evaluated_before_search)
        # Keep several iterations inside a modest budget so every third
        # iteration can actually explore the double-swap neighbourhood.
        sample_size = min(6, remaining_budget, len(moves))
        indices = rng.permutation(len(moves))[:sample_size]
        candidates: list[tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]] = []
        for index in indices:
            removed, added = moves[int(index)]
            ids = tuple(sorted((set(selected) - set(removed)) | set(added)))
            score(ids)
            is_tabu = any(
                tabu_until.get(satellite_id, -1) > iteration for satellite_id in (*removed, *added)
            )
            if not is_tabu:
                candidates.append((ids, removed, added))
            if ids not in known_sets and (
                best_novel is None or (*score(ids), ids) < (*score(best_novel), best_novel)
            ):
                best_novel = ids
        if not candidates:
            iteration += 1
            continue
        current, removed, added = min(candidates, key=lambda item: (*score(item[0]), item[0]))
        for satellite_id in (*removed, *added):
            tabu_until[satellite_id] = iteration + 5
        iteration += 1

    if best_novel is None:
        return None, {"evaluated": len(cache) - evaluated_before_search, "reason": "no_novel_set"}
    worst, max_outage_s = score(best_novel)
    return (
        FailureCase(case_id, best_novel, "adversarial"),
        {
            "evaluated": len(cache) - evaluated_before_search,
            "worst_availability": worst,
            "max_outage_s": max_outage_s,
            "iterations": iteration,
        },
    )


def run_failure_robust_optimization(
    normal_scenario: dict[str, Any],
    fixed_failure_scenario: dict[str, Any],
    variable_names: list[str],
    bounds: dict[str, tuple[float, float]],
    routing_strategy: str,
    budget: int,
    seed: int,
    algorithm: str,
    initial_exploration_size: int,
    polish: bool,
    *,
    failure_count: int,
    random_samples: int,
    correlated_samples: int,
    cvar_alpha: float,
    adversarial_rounds: int,
    adversarial_search_budget: int,
    adversarial_cases_per_round: int,
    adversarial_min_distance: int,
    outer_restarts: int,
    holdout_random_samples: int,
    holdout_correlated_samples: int,
    target_availability: float,
    progress: Any = None,
) -> dict[str, Any]:
    """Alternate CVaR angle optimization and adversarial bank expansion."""
    started = time.perf_counter()
    original_parameters = plane_parameters(normal_scenario)
    incumbent_parameters = original_parameters
    bank, failure_start_s, failure_end_s = build_failure_bank(
        normal_scenario,
        fixed_failure_scenario,
        failure_count=failure_count,
        random_samples=random_samples,
        correlated_samples=correlated_samples,
        seed=seed,
    )
    rounds: list[dict[str, Any]] = []
    total_evaluated = 0
    total_revalidated = 0
    total_hits = 0
    total_misses = 0
    convergence: list[dict[str, Any]] = []
    final_search: dict[str, Any] | None = None

    for round_index in range(adversarial_rounds + 1):
        round_cache: dict[tuple[tuple[str, float], ...], dict[str, Any]] = {}
        cache_hits = 0
        cache_misses = 0

        def evaluator(
            parameters: dict[str, float],
            bypass: bool,
            _cache: dict[tuple[tuple[str, float], ...], dict[str, Any]] = round_cache,
            _bank: tuple[FailureCase, ...] = tuple(bank),
        ) -> dict[str, Any]:
            nonlocal cache_hits, cache_misses
            key = canonical_parameters(parameters)
            if not bypass and key in _cache:
                cache_hits += 1
                return copy.deepcopy(_cache[key])
            cache_misses += 1
            result = evaluate_failure_configuration(
                normal_scenario,
                parameters,
                list(_bank),
                routing_strategy,
                failure_start_s=failure_start_s,
                failure_end_s=failure_end_s,
                cvar_alpha=cvar_alpha,
                baseline_parameters=original_parameters,
            )
            if not bypass:
                _cache[key] = copy.deepcopy(result)
            return result

        def scalar(candidate: dict[str, Any]) -> float:
            return failure_cvar_scalar(candidate, target_availability)

        def rank(candidate: dict[str, Any]) -> tuple[Any, ...]:
            return failure_cvar_rank_key(candidate, target_availability)

        restart_results: list[dict[str, Any]] = []
        combined_dataset: list[dict[str, Any]] = []
        round_evaluated = 0
        round_revalidated = 0
        for restart in range(outer_restarts):
            restart_offset = total_evaluated

            def restart_progress(
                evaluated: int,
                best: dict[str, Any],
                _offset: int = restart_offset,
            ) -> None:
                if progress:
                    progress(_offset + evaluated, best)

            restart_initial_size = min(initial_exploration_size, max(0, budget - 1))
            if algorithm == "toroidal_differential_evolution":
                # The search implementation creates the minimum toroidal
                # population itself; leave budget for mutation generations.
                restart_initial_size = 0
            restart_result = optimize(
                incumbent_parameters,
                variable_names,
                bounds,
                budget,
                seed + round_index * 1000 + restart,
                algorithm,
                restart_initial_size,
                False,
                evaluator,
                restart_progress,
                polish,
                scalar,
                rank,
            )
            for point in restart_result["convergence"]:
                convergence.append(
                    {
                        **point,
                        "evaluation": restart_offset + int(point["evaluation"]),
                        "round": round_index,
                        "restart": restart,
                    }
                )
            for candidate in restart_result["dataset"]:
                global_candidate = copy.deepcopy(candidate)
                global_candidate["evaluation"] = restart_offset + int(
                    candidate.get("evaluation", 0)
                )
                combined_dataset.append(global_candidate)
            restart_results.append(restart_result)
            round_evaluated += restart_result["evaluated"]
            round_revalidated += restart_result["revalidated_candidates"]
            total_evaluated += restart_result["evaluated"]

        best_result = min(restart_results, key=lambda result: rank(result["best"]))
        unique_candidates: dict[tuple[tuple[str, float], ...], dict[str, Any]] = {}
        for candidate in combined_dataset:
            key = canonical_parameters(candidate["parameters"])
            if key not in unique_candidates or rank(candidate) < rank(unique_candidates[key]):
                unique_candidates[key] = candidate
        combined_ranked = sorted(unique_candidates.values(), key=rank)
        search_result = {
            **best_result,
            "best": combined_ranked[0],
            "top_candidates": combined_ranked[:10],
            "dataset": combined_dataset,
            "evaluated": round_evaluated,
            "revalidated_candidates": round_revalidated,
        }
        total_revalidated += round_revalidated
        total_hits += cache_hits
        total_misses += cache_misses
        final_search = search_result
        incumbent_parameters = search_result["best"]["parameters"]
        round_summary: dict[str, Any] = {
            "round": round_index,
            "outer_restarts": outer_restarts,
            "bank_size": len(bank),
            "evaluated": round_evaluated,
            "best_cvar_availability": search_result["best"]["failure_robust"]["cvar_availability"],
            "best_worst_availability": search_result["best"]["failure_robust"][
                "worst_availability"
            ],
        }
        rounds.append(round_summary)

        if round_index < adversarial_rounds:
            generated: list[FailureCase] = []
            adversarial_stats: list[dict[str, Any]] = []
            temporary_bank = list(bank)
            known_scores = dict(search_result["best"]["failure_robust"]["case_scores"])
            base_budget, remainder = divmod(adversarial_search_budget, adversarial_cases_per_round)
            for case_index in range(adversarial_cases_per_round):
                case_budget = base_budget + (1 if case_index < remainder else 0)
                adversarial_case, stats = find_adversarial_failure_case(
                    normal_scenario,
                    incumbent_parameters,
                    temporary_bank,
                    routing_strategy,
                    failure_count=failure_count,
                    failure_start_s=failure_start_s,
                    failure_end_s=failure_end_s,
                    budget=case_budget,
                    seed=seed + 10_000 + round_index * 100 + case_index,
                    case_id=f"adversarial_{round_index + 1:02d}_{case_index + 1:02d}",
                    known_scores=known_scores,
                )
                stats["requested_case"] = case_index + 1
                if adversarial_case is not None:
                    distance = min(
                        (
                            len(set(adversarial_case.satellite_ids) ^ set(other.satellite_ids)) // 2
                            for other in generated
                        ),
                        default=failure_count,
                    )
                    stats["minimum_swap_distance"] = distance
                    if distance >= adversarial_min_distance:
                        generated.append(adversarial_case)
                        temporary_bank.append(adversarial_case)
                        known_scores[adversarial_case.case_id] = stats["worst_availability"]
                    else:
                        stats["reason"] = "diversity_rejected"
                adversarial_stats.append(stats)
            round_summary["adversarial_search"] = adversarial_stats
            round_summary["adversarial_cases_added"] = len(generated)
            if not generated:
                break
            bank.extend(generated)

    assert final_search is not None
    # The final round was optimized against the final bank.  Re-evaluate the
    # original parameters against that same bank for an apples-to-apples baseline.
    baseline = evaluate_failure_configuration(
        normal_scenario,
        original_parameters,
        bank,
        routing_strategy,
        failure_start_s=failure_start_s,
        failure_end_s=failure_end_s,
        cvar_alpha=cvar_alpha,
        baseline_parameters=original_parameters,
    )
    best = final_search["best"]
    baseline_cvar = baseline["failure_robust"]["cvar_availability"] * 100
    best_cvar = best["failure_robust"]["cvar_availability"] * 100
    normal_status = (
        "выполнено" if best["failure_robust"]["normal_target_feasible"] else "не выполнено"
    )
    derived = apply_plane_parameters(normal_scenario, best["parameters"])
    derived["failures"] = []

    holdout_validation: dict[str, Any] | None = None
    if holdout_random_samples > 0 or holdout_correlated_samples > 0:
        holdout_candidates, _, _ = build_failure_bank(
            normal_scenario,
            fixed_failure_scenario,
            failure_count=failure_count,
            random_samples=holdout_random_samples,
            correlated_samples=holdout_correlated_samples,
            seed=seed + 1_000_000,
        )
        training_sets = {case.satellite_ids for case in bank}
        holdout_cases = [
            FailureCase(f"holdout_{index:03d}", case.satellite_ids, case.kind)
            for index, case in enumerate(holdout_candidates)
            if case.kind != "fixed" and case.satellite_ids not in training_sets
        ]
        if holdout_cases:
            holdout_baseline = evaluate_failure_configuration(
                normal_scenario,
                original_parameters,
                holdout_cases,
                routing_strategy,
                failure_start_s=failure_start_s,
                failure_end_s=failure_end_s,
                cvar_alpha=cvar_alpha,
                baseline_parameters=original_parameters,
            )
            holdout_best = evaluate_failure_configuration(
                normal_scenario,
                best["parameters"],
                holdout_cases,
                routing_strategy,
                failure_start_s=failure_start_s,
                failure_end_s=failure_end_s,
                cvar_alpha=cvar_alpha,
                baseline_parameters=original_parameters,
            )
            holdout_validation = {
                "seed": seed + 1_000_000,
                "bank_size": len(holdout_cases),
                "cases": [asdict(case) for case in holdout_cases],
                "baseline": holdout_baseline["failure_robust"],
                "best": holdout_best["failure_robust"],
                "generalization_gap": (
                    best["failure_robust"]["cvar_availability"]
                    - holdout_best["failure_robust"]["cvar_availability"]
                ),
            }

    return {
        "mode": "failure_cvar",
        "baseline": baseline,
        "best": best,
        "top_candidates": final_search["top_candidates"],
        "pareto_front": [],
        "dataset": final_search["dataset"],
        "convergence": convergence,
        "evaluated": total_evaluated,
        "runtime_s": time.perf_counter() - started,
        "revalidated_candidates": total_revalidated,
        "cache": {
            "hits": total_hits,
            "misses": total_misses,
            "exact_evaluations": total_misses + 1 + (2 if holdout_validation else 0),
            "evaluations_requested": total_evaluated,
        },
        "derived_scenario": derived,
        "recommendation": (
            f"CVaR{cvar_alpha:.0%} пост-отказной доступности изменился с "
            f"{baseline_cvar:.2f}% до {best_cvar:.2f}%; ограничение штатного "
            f"режима ≥{target_availability:.0%} {normal_status}."
        ),
        "failure_bank": [asdict(case) for case in bank],
        "failure_start_s": failure_start_s,
        "failure_end_s": failure_end_s,
        "failure_count": failure_count,
        "cvar_alpha": cvar_alpha,
        "optimization_rounds": rounds,
        "budget_per_round": budget,
        "outer_restarts": outer_restarts,
        "adversarial_cases_per_round": adversarial_cases_per_round,
        "adversarial_min_distance": adversarial_min_distance,
        "holdout_validation": holdout_validation,
    }
