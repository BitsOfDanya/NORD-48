"""Budgeted random exploration followed by SciPy differential evolution."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import numpy as np
from scipy.optimize import differential_evolution

from app.calculation.optimization.configuration import candidate_rank_key


class BudgetExhausted(RuntimeError):
    pass


def optimize(
    baseline_parameters: dict[str, float],
    variable_names: list[str],
    bounds: dict[str, tuple[float, float]],
    budget: int,
    seed: int,
    algorithm: str,
    initial_exploration_size: int,
    stop_on_target: bool,
    evaluator: Callable[[dict[str, float], bool], dict[str, Any]],
    progress: Callable[[int, dict[str, Any]], None] | None = None,
    polish: bool = False,
    scalar_objective: Callable[[dict[str, Any]], float] | None = None,
    rank_key: Callable[[dict[str, Any]], tuple[Any, ...]] | None = None,
) -> dict[str, Any]:
    """`scalar_objective` is what scipy DE minimizes directly (must stay
    consistent with `rank_key`'s ordering — both default to the
    unconstrained `1 - worst_availability` / `candidate_rank_key` pair used
    by normal/robust mode). A different mode (e.g. constrained-robust)
    passes both together so DE's own search and the final ranking agree on
    what "better" means."""
    if budget < 1 or not variable_names:
        raise ValueError("budget and at least one variable are required")
    scalar_objective = scalar_objective or (lambda c: 1.0 - c["aggregates"]["worst_availability"])
    rank_key = rank_key or candidate_rank_key
    ordered_bounds = [bounds[name] for name in variable_names]
    rng = np.random.default_rng(seed)
    evaluated: list[dict[str, Any]] = []
    convergence: list[dict[str, float | int]] = []
    halted = False
    started = time.perf_counter()

    def run_vector(vector: np.ndarray) -> float:
        nonlocal halted
        if len(evaluated) >= budget:
            raise BudgetExhausted
        parameters = dict(baseline_parameters)
        parameters.update({name: float(value) for name, value in zip(variable_names, vector, strict=True)})
        result = evaluator(parameters, False)
        result["evaluation"] = len(evaluated) + 1
        evaluated.append(result)
        best = min(evaluated, key=rank_key)
        convergence.append(
            {"evaluation": len(evaluated), "best_worst_availability": best["aggregates"]["worst_availability"]}
        )
        if progress:
            progress(len(evaluated), best)
        if stop_on_target and result["aggregates"]["target_feasible"]:
            halted = True
            raise BudgetExhausted
        return scalar_objective(result)

    # Baseline is always the first exact candidate.
    try:
        run_vector(np.array([baseline_parameters[name] for name in variable_names]))
    except BudgetExhausted:
        pass
    random_count = min(max(0, initial_exploration_size), budget - len(evaluated))
    for _ in range(0 if halted else random_count):
        vector = np.array([rng.uniform(low, high) for low, high in ordered_bounds])
        try:
            run_vector(vector)
        except BudgetExhausted:
            break

    if algorithm == "differential_evolution" and len(evaluated) < budget and not halted:
        population_size = max(5, min(10, (budget - len(evaluated)) // max(1, len(variable_names))))
        try:
            differential_evolution(
                run_vector,
                ordered_bounds,
                seed=seed,
                popsize=population_size,
                maxiter=max(1, budget),
                polish=polish,
                workers=1,
                updating="immediate",
                tol=0.0,
            )
        except BudgetExhausted:
            pass
    elif algorithm == "random" and not halted:
        while len(evaluated) < budget:
            try:
                run_vector(np.array([rng.uniform(low, high) for low, high in ordered_bounds]))
            except BudgetExhausted:
                break
    elif algorithm != "differential_evolution":
        raise ValueError(f"unsupported algorithm: {algorithm}")

    ranked = sorted(evaluated, key=rank_key)
    revalidated = [evaluator(candidate["parameters"], True) for candidate in ranked[:5]]
    for cached, exact in zip(ranked[:5], revalidated, strict=True):
        if rank_key(cached)[:-1] != rank_key(exact)[:-1]:
            raise RuntimeError("exact revalidation mismatch")
    return {
        "best": ranked[0],
        "top_candidates": ranked[:10],
        "dataset": evaluated,
        "convergence": convergence,
        "evaluated": len(evaluated),
        "runtime_s": time.perf_counter() - started,
        "revalidated_candidates": len(revalidated),
    }
