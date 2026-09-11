"""In-memory asynchronous jobs for exact configuration optimization."""

from __future__ import annotations

import copy
import threading
import uuid
from typing import Any

from app.calculation.optimization.configuration import (
    EvaluationCache,
    apply_plane_parameters,
    evaluate_configuration,
    plane_parameters,
)
from app.calculation.optimization.search import optimize

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _recommendation(baseline: dict[str, Any], best: dict[str, Any]) -> str:
    before = baseline["aggregates"]["worst_availability"] * 100
    after = best["aggregates"]["worst_availability"] * 100
    changed = [
        f"{name}: {baseline['parameters'][name]:.1f}°→{value:.1f}°"
        for name, value in best["parameters"].items()
        if abs(value - baseline["parameters"][name]) > 1e-8
    ]
    changes = "; ".join(changed) if changed else "углы не изменены"
    if best["aggregates"]["target_feasible"]:
        status = "Целевой уровень 90% достигнут во всех выбранных условиях."
    else:
        status = (
            "В пределах исследованного пространства конфигурация с target >=90% "
            "не найдена; изменения RAAN/phase недостаточны при фиксированной архитектуре."
        )
    return (
        f"{changes}. Худшая доступность изменилась с {before:.2f}% "
        f"до {after:.2f}%. {status}"
    )


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
) -> dict[str, Any]:
    reference = next(iter(scenarios.values()))
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
    )
    best = search_result["best"]
    return {
        "baseline": baseline,
        **search_result,
        "cache": {
            "hits": cache.hits,
            "misses": cache.misses,
            "exact_evaluations": cache.misses,
            "evaluations_requested": search_result["evaluated"],
        },
        "derived_scenario": apply_plane_parameters(reference, best["parameters"]),
        "recommendation": _recommendation(baseline, best),
    }


def create_job(settings: dict[str, Any]) -> str:
    run_id = str(uuid.uuid4())
    with _LOCK:
        _JOBS[run_id] = {
            "run_id": run_id,
            "status": "queued",
            "evaluated": 0,
            "budget": settings["budget"],
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
