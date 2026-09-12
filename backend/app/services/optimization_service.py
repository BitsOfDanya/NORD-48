"""In-memory asynchronous jobs for exact configuration optimization."""

from __future__ import annotations

import copy
import threading
import uuid
from functools import partial
from typing import Any

from app.calculation.optimization.configuration import (
    EvaluationCache,
    apply_plane_parameters,
    candidate_rank_key,
    constrained_robust_rank_key,
    constrained_robust_scalar,
    degraded_worst_availability,
    evaluate_configuration,
    normal_target_shortfall,
    pareto_frontier,
    plane_parameters,
    robust_design_rank_key,
    robust_design_scalar,
    robust_primary_metric,
    robust_secondary_metric,
)
from app.calculation.optimization.failure_robust import run_failure_robust_optimization
from app.calculation.optimization.search import optimize

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _recommendation(
    baseline: dict[str, Any],
    best: dict[str, Any],
    *,
    mode: str,
    normal_profile: str | None,
    target_availability: float,
    degraded_profile_ids: tuple[str, ...] | None = None,
) -> str:
    before = baseline["aggregates"]["worst_availability"] * 100
    after = best["aggregates"]["worst_availability"] * 100
    changed = [
        f"{name}: {baseline['parameters'][name]:.1f}°→{value:.1f}°"
        for name, value in best["parameters"].items()
        if abs(value - baseline["parameters"][name]) > 1e-8
    ]
    changes = "; ".join(changed) if changed else "углы не изменены"

    if mode == "constrained_robust":
        assert normal_profile is not None
        shortfall = normal_target_shortfall(best, normal_profile, target_availability)
        if shortfall == 0:
            degraded = degraded_worst_availability(best, normal_profile) * 100
            status = (
                f"Ограничение выполнено: штатный режим достигает target ≥90% для "
                f"всех клиентов. Худшая доступность в деградированных условиях: "
                f"{degraded:.2f}%."
            )
        else:
            status = (
                "Ограничение НЕ выполнено ни у одного найденного кандидата: в "
                "штатном режиме target ≥90% недостижим при исследованных RAAN/phase — "
                "показан кандидат с наименьшим суммарным дефицитом до цели."
            )
        return f"{changes}. {status}"

    if mode == "robust_design":
        assert normal_profile is not None
        assert degraded_profile_ids is not None
        shortfall = normal_target_shortfall(best, normal_profile, target_availability)
        if shortfall > 0:
            return (
                f"{changes}. Ограничение НЕ выполнено ни у одного найденного "
                "кандидата: в штатном режиме target ≥90% недостижим при "
                "исследованных RAAN/phase — показан кандидат с наименьшим "
                "суммарным дефицитом до цели."
            )
        primary_before = robust_primary_metric(baseline, degraded_profile_ids) * 100
        primary_after = robust_primary_metric(best, degraded_profile_ids) * 100
        secondary_after = robust_secondary_metric(best, degraded_profile_ids) * 100
        delta = primary_after - primary_before
        profiles_label = " и ".join(degraded_profile_ids)
        return (
            f"{changes}. Штатный режим выполняет target ≥90% для всех клиентов. "
            f"Худшая доступность среди деградированных условий ({profiles_label}): "
            f"{primary_before:.2f}% → {primary_after:.2f}% ({delta:+.2f} п.п.). "
            f"Средняя доступность худшего из этих условий: {secondary_after:.2f}%."
        )

    if best["aggregates"]["target_feasible"]:
        status = "Целевой уровень 90% достигнут во всех выбранных условиях."
    else:
        status = (
            "В пределах исследованного пространства конфигурация с target >=90% "
            "не найдена; изменения RAAN/phase недостаточны при фиксированной архитектуре."
        )
    return f"{changes}. Худшая доступность изменилась с {before:.2f}% до {after:.2f}%. {status}"


def run_optimization(
    scenarios: dict[str, dict[str, Any]],
    variable_names: list[str],
    bounds: dict[str, tuple[float, float]],
    routing_strategy: str,
    budget: int,
    seed: int,
    algorithm: str,
    initial_exploration_size: int,
    stop_on_target: bool,
    polish: bool,
    progress: Any = None,
    mode: str = "normal",
    normal_profile: str | None = None,
    target_availability: float = 0.9,
    degraded_profile_ids: tuple[str, ...] | None = None,
    fixed_failure_profile: str | None = None,
    failure_count: int = 10,
    failure_random_samples: int = 8,
    failure_correlated_samples: int = 6,
    cvar_alpha: float = 0.1,
    adversarial_rounds: int = 0,
    adversarial_search_budget: int = 40,
    adversarial_cases_per_round: int = 1,
    adversarial_min_distance: int = 1,
    outer_restarts: int = 1,
    holdout_random_samples: int = 0,
    holdout_correlated_samples: int = 0,
) -> dict[str, Any]:
    if mode == "failure_cvar":
        assert normal_profile is not None and fixed_failure_profile is not None
        return run_failure_robust_optimization(
            scenarios[normal_profile],
            scenarios[fixed_failure_profile],
            variable_names,
            bounds,
            routing_strategy,
            budget,
            seed,
            algorithm,
            initial_exploration_size,
            polish,
            failure_count=failure_count,
            random_samples=failure_random_samples,
            correlated_samples=failure_correlated_samples,
            cvar_alpha=cvar_alpha,
            adversarial_rounds=adversarial_rounds,
            adversarial_search_budget=adversarial_search_budget,
            adversarial_cases_per_round=adversarial_cases_per_round,
            adversarial_min_distance=adversarial_min_distance,
            outer_restarts=outer_restarts,
            holdout_random_samples=holdout_random_samples,
            holdout_correlated_samples=holdout_correlated_samples,
            target_availability=target_availability,
            progress=progress,
        )
    reference = scenarios[normal_profile] if normal_profile else next(iter(scenarios.values()))
    baseline_parameters = plane_parameters(reference)
    cache = EvaluationCache()

    def evaluator(parameters: dict[str, float], bypass_cache: bool) -> dict[str, Any]:
        return evaluate_configuration(
            scenarios,
            parameters,
            routing_strategy,
            baseline_parameters=baseline_parameters,
            cache=cache,
            bypass_cache=bypass_cache,
        )

    baseline = evaluator(baseline_parameters, False)

    scalar_objective = None
    rank_key = None
    if mode == "constrained_robust":
        assert normal_profile is not None
        scalar_objective = partial(
            constrained_robust_scalar,
            normal_profile=normal_profile,
            target_availability=target_availability,
        )
        rank_key = partial(
            constrained_robust_rank_key,
            normal_profile=normal_profile,
            target_availability=target_availability,
        )
    elif mode == "robust_design":
        assert normal_profile is not None
        assert degraded_profile_ids is not None
        scalar_objective = partial(
            robust_design_scalar,
            normal_profile=normal_profile,
            degraded_profiles=degraded_profile_ids,
            target_availability=target_availability,
        )
        rank_key = partial(
            robust_design_rank_key,
            normal_profile=normal_profile,
            degraded_profiles=degraded_profile_ids,
            target_availability=target_availability,
        )

    search_result = optimize(
        baseline_parameters,
        variable_names,
        bounds,
        budget,
        seed,
        algorithm,
        initial_exploration_size,
        stop_on_target,
        evaluator,
        progress,
        polish,
        scalar_objective,
        rank_key,
    )
    best = search_result["best"]
    return {
        "mode": mode,
        "baseline": baseline,
        **search_result,
        "cache": {
            "hits": cache.hits,
            "misses": cache.misses,
            "exact_evaluations": cache.misses,
            "evaluations_requested": search_result["evaluated"],
        },
        "pareto_front": sorted(
            pareto_frontier(search_result["dataset"]), key=rank_key or candidate_rank_key
        )[:20],
        "derived_scenario": apply_plane_parameters(reference, best["parameters"]),
        "recommendation": _recommendation(
            baseline,
            best,
            mode=mode,
            normal_profile=normal_profile,
            target_availability=target_availability,
            degraded_profile_ids=degraded_profile_ids,
        ),
    }


def create_job(settings: dict[str, Any]) -> str:
    run_id = str(uuid.uuid4())
    total_budget = settings["budget"] * (
        (settings.get("adversarial_rounds", 0) + 1) * settings.get("outer_restarts", 1)
        if settings.get("mode") == "failure_cvar"
        else 1
    )
    with _LOCK:
        _JOBS[run_id] = {
            "run_id": run_id,
            "status": "queued",
            "evaluated": 0,
            "budget": total_budget,
            "best_worst_availability": None,
        }

    def work() -> None:
        with _LOCK:
            _JOBS[run_id]["status"] = "running"

        def progress(evaluated: int, best: dict[str, Any]) -> None:
            with _LOCK:
                _JOBS[run_id].update(
                    evaluated=evaluated,
                    best_worst_availability=best["aggregates"]["worst_availability"],
                    target_feasible=best["aggregates"]["target_feasible"],
                )

        try:
            result = run_optimization(progress=progress, **settings)
            with _LOCK:
                _JOBS[run_id].update(status="completed", result=result)
        except Exception as exc:  # pragma: no cover
            with _LOCK:
                _JOBS[run_id].update(status="failed", error=str(exc))

    threading.Thread(target=work, name=f"optimization-{run_id}", daemon=True).start()
    return run_id


def get_job(run_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _JOBS.get(run_id)
        return copy.deepcopy(job) if job else None
