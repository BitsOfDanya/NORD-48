"""In-memory asynchronous jobs for deployment sequence planning and
minimum-constellation-size analysis — both answered from one greedy sweep,
see `app.calculation.optimization.deployment_planner` for why.
"""

from __future__ import annotations

import copy
import threading
import uuid
from dataclasses import asdict
from typing import Any

from app.calculation.optimization.deployment_planner import (
    SubsetEvaluation,
    active_subset_scenario,
    greedy_sequence,
    minimum_size_for_target,
    refine_stage,
    refine_subset_local_search,
)

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _subset_dict(evaluation: SubsetEvaluation) -> dict[str, Any]:
    return asdict(evaluation)


def run_plan(
    scenario: dict[str, Any],
    routing_strategy: str,
    stage_sizes: list[int],
    *,
    refine_budget: int,
    refine_seed: int,
    one_swap_passes: int = 0,
    tabu_iterations: int = 0,
    tabu_candidates_per_iteration: int = 24,
    tabu_tenure: int = 5,
    local_search_seed: int = 42,
    max_search_size: int | None = None,
    progress: Any = None,
) -> dict[str, Any]:
    total_satellites = len(scenario["design"]["satellites"])
    target_availability = scenario["environment"]["target_availability"]

    sequence = greedy_sequence(
        scenario, routing_strategy, max_size=max_search_size, progress=progress
    )
    by_size = {evaluation.size: evaluation for evaluation in sequence}

    stages: list[dict[str, Any]] = []
    for size in sorted(set(stage_sizes)):
        if size not in by_size:
            continue
        greedy_subset = by_size[size]
        subset = greedy_subset
        stage: dict[str, Any] = {"size": size, "subset": _subset_dict(subset)}
        if one_swap_passes > 0 or tabu_iterations > 0:
            local = refine_subset_local_search(
                scenario,
                greedy_subset,
                routing_strategy,
                one_swap_passes=one_swap_passes,
                tabu_iterations=tabu_iterations,
                tabu_candidates_per_iteration=tabu_candidates_per_iteration,
                tabu_tenure=tabu_tenure,
                seed=local_search_seed + size,
            )
            subset = local.best
            stage["greedy_subset"] = _subset_dict(greedy_subset)
            stage["subset"] = _subset_dict(subset)
            stage["local_search"] = {
                "method": "best_improvement_1swap_then_tabu",
                "one_swap_passes_completed": local.one_swap_passes_completed,
                "one_swap_evaluations": local.one_swap_evaluations,
                "tabu_iterations_completed": local.tabu_iterations_completed,
                "tabu_evaluations": local.tabu_evaluations,
                "improvement": local.improvement,
                "seed": local.seed,
            }
        if refine_budget > 0:
            stage["refined"] = refine_stage(
                scenario, subset, routing_strategy, budget=refine_budget, seed=refine_seed
            )
        stage["derived_scenario"] = active_subset_scenario(
            scenario, set(subset.active_satellite_ids)
        )
        stages.append(stage)

    min_size = minimum_size_for_target(sequence, target_availability)
    locally_feasible_sizes = [
        stage["size"] for stage in stages if stage["subset"]["target_feasible"]
    ]
    if locally_feasible_sizes:
        min_size = min([size for size in [min_size, *locally_feasible_sizes] if size is not None])
    searched_up_to = sequence[-1].size if sequence else 0
    capped = searched_up_to < total_satellites

    return {
        "scenario_id": scenario.get("meta", {}).get("id"),
        "scenario_title": scenario.get("meta", {}).get("title"),
        "routing_strategy": routing_strategy,
        "total_satellites": total_satellites,
        "target_availability": target_availability,
        "method": (
            "greedy_then_1swap_tabu"
            if one_swap_passes > 0 or tabu_iterations > 0
            else "greedy_constructive_sweep"
        ),
        "stage_sizes_requested": sorted(set(stage_sizes)),
        "searched_up_to_size": searched_up_to,
        "search_capped": capped,
        "stages": stages,
        "size_curve": [_subset_dict(evaluation) for evaluation in sequence],
        "minimum_constellation_size": min_size,
        "minimum_constellation_size_found": min_size is not None,
    }


def create_job(settings: dict[str, Any]) -> str:
    run_id = str(uuid.uuid4())
    total = len(settings["scenario"]["design"]["satellites"])
    with _LOCK:
        _JOBS[run_id] = {
            "run_id": run_id,
            "status": "queued",
            "evaluated": 0,
            "total": total,
            "best_worst_availability": None,
        }

    def work() -> None:
        with _LOCK:
            _JOBS[run_id]["status"] = "running"

        def progress(step: int, cap: int, best: SubsetEvaluation) -> None:
            with _LOCK:
                _JOBS[run_id].update(
                    evaluated=step,
                    total=cap,
                    best_worst_availability=best.worst_availability,
                )

        try:
            result = run_plan(progress=progress, **settings)
            with _LOCK:
                _JOBS[run_id].update(status="completed", result=result)
        except Exception as exc:  # pragma: no cover
            with _LOCK:
                _JOBS[run_id].update(status="failed", error=str(exc))

    threading.Thread(target=work, name=f"deployment-plan-{run_id}", daemon=True).start()
    return run_id


def get_job(run_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _JOBS.get(run_id)
        return copy.deepcopy(job) if job else None
