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


def _is_full_circle(low: float, high: float) -> bool:
    return abs(low) < 1e-12 and abs(high - low - 360.0) < 1e-12


def _circular_delta(delta: float, span: float) -> float:
    """Shortest signed difference on a torus of circumference `span` — e.g.
    on [0, 360) the raw difference between angles 359 and 1 is 358, but the
    two points are only 2 degrees apart the short way around."""
    return (delta + span / 2) % span - span / 2


def _wrap_into_bounds(value: float, low: float, span: float) -> float:
    """Wrap `value` back into [low, low + span) — e.g. 361 -> 1 and
    -1 -> 359 on a [0, 360) torus."""
    return low + (value - low) % span


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
    pretrained_model: Any = None,
) -> dict[str, Any]:
    """`scalar_objective` is what scipy DE minimizes directly (must stay
    consistent with `rank_key`'s ordering — both default to the
    unconstrained `1 - worst_availability` / `candidate_rank_key` pair used
    by normal/robust mode). A different mode (e.g. constrained-robust)
    passes both together so DE's own search and the final ranking agree on
    what "better" means."""
    if budget < 1 or not variable_names:
        raise ValueError("budget and at least one variable are required")
    if algorithm == "catboost_pretrained":
        if pretrained_model is None:
            raise ValueError("catboost_pretrained requires a compatible trained model")
        # Exact shortlist, including baseline. The remaining pool is inference only.
        budget = min(budget, 16)
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
    toroidal_population_size = max(8, 2 * len(variable_names))
    requested_random = initial_exploration_size
    if algorithm == "catboost_pretrained":
        requested_random = 0
    if algorithm == "catboost":
        requested_random = max(requested_random, 31)
    if algorithm == "toroidal_differential_evolution":
        requested_random = max(requested_random, toroidal_population_size - 1)
    random_count = min(max(0, requested_random), budget - len(evaluated))
    for _ in range(0 if halted else random_count):
        vector = np.array([rng.uniform(low, high) for low, high in ordered_bounds])
        try:
            run_vector(vector)
        except BudgetExhausted:
            break

    surrogate_fits = 0
    surrogate_predictions = 0
    if algorithm == "catboost_pretrained" and not halted and len(evaluated) < budget:
        from app.calculation.optimization.catboost_surrogate import angle_features

        pool = rng.uniform(
            [b[0] for b in ordered_bounds], [b[1] for b in ordered_bounds],
            size=(8192, len(variable_names)),
        )
        predictions = np.asarray(pretrained_model.predict(angle_features(pool)))
        surrogate_predictions = len(pool)
        for index in np.argsort(predictions)[:budget - len(evaluated)]:
            try:
                run_vector(pool[index])
            except BudgetExhausted:
                break
    elif algorithm == "catboost" and not halted:
        from app.calculation.optimization.catboost_surrogate import angle_features, fit_surrogate

        while len(evaluated) < budget:
            vectors = np.array([[c["parameters"][n] for n in variable_names] for c in evaluated])
            targets = np.array([scalar_objective(c) for c in evaluated])
            model = fit_surrogate(vectors, targets, seed)
            surrogate_fits += 1
            pool = rng.uniform(
                [b[0] for b in ordered_bounds], [b[1] for b in ordered_bounds],
                size=(1024, len(variable_names)),
            )
            predictions = np.asarray(model.predict(angle_features(pool)))
            # Reserve one of each eight exact evaluations for exploration.
            selected = list(np.argsort(predictions)[:7]) + [1023]
            for index in selected:
                try:
                    run_vector(pool[index])
                except BudgetExhausted:
                    break
            if halted:
                break
    elif algorithm == "differential_evolution" and len(evaluated) < budget and not halted:
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
    elif algorithm == "toroidal_differential_evolution" and len(evaluated) < budget and not halted:
        # SciPy's bounded DE treats the opposite edges of [0, 360] as far
        # apart.  Orbital angles live on a torus, so use circular differences
        # and wrap full-circle dimensions after mutation.
        population = [
            np.array([candidate["parameters"][name] for name in variable_names], dtype=float)
            for candidate in evaluated[-toroidal_population_size:]
        ]
        energies = [scalar_objective(candidate) for candidate in evaluated[-len(population) :]]
        while len(population) < 4 and len(evaluated) < budget:
            vector = np.array([rng.uniform(low, high) for low, high in ordered_bounds])
            try:
                energy = run_vector(vector)
            except BudgetExhausted:
                break
            population.append(vector)
            energies.append(energy)

        while len(evaluated) < budget and len(population) >= 4:
            for candidate_index in range(len(population)):
                if len(evaluated) >= budget:
                    break
                choices = [index for index in range(len(population)) if index != candidate_index]
                r1, r2, r3 = rng.choice(choices, size=3, replace=False)
                base = population[int(r1)]
                delta = population[int(r2)] - population[int(r3)]
                for dimension, (low, high) in enumerate(ordered_bounds):
                    if _is_full_circle(low, high):
                        delta[dimension] = _circular_delta(delta[dimension], high - low)
                mutation = float(rng.uniform(0.5, 1.0))
                mutant = base + mutation * delta
                for dimension, (low, high) in enumerate(ordered_bounds):
                    if _is_full_circle(low, high):
                        mutant[dimension] = _wrap_into_bounds(mutant[dimension], low, high - low)
                    else:
                        mutant[dimension] = float(np.clip(mutant[dimension], low, high))
                crossover = rng.random(len(variable_names)) < 0.7
                crossover[int(rng.integers(0, len(variable_names)))] = True
                trial = np.where(crossover, mutant, population[candidate_index])
                try:
                    trial_energy = run_vector(trial)
                except BudgetExhausted:
                    break
                if trial_energy <= energies[candidate_index]:
                    population[candidate_index] = trial
                    energies[candidate_index] = trial_energy
    elif algorithm == "random" and not halted:
        while len(evaluated) < budget:
            try:
                run_vector(np.array([rng.uniform(low, high) for low, high in ordered_bounds]))
            except BudgetExhausted:
                break
    elif algorithm not in {"differential_evolution", "toroidal_differential_evolution", "catboost", "catboost_pretrained"}:
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
        "surrogate_fits": surrogate_fits,
        "surrogate_predictions": surrogate_predictions,
    }
