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
    ThresholdPoint,
    first_verified_pass,
    greedy_sequence,
    marginal_gain_curve,
    minimum_size_for_target,
    refine_stage,
    target_margin_pp,
    verify_threshold,
)

_JOBS: dict[str, dict[str, Any]] = {}
_THRESHOLD_JOBS: dict[str, dict[str, Any]] = {}
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
        subset = by_size[size]
        stage: dict[str, Any] = {"size": size, "subset": _subset_dict(subset)}
        if refine_budget > 0:
            stage["refined"] = refine_stage(
                scenario, subset, routing_strategy, budget=refine_budget, seed=refine_seed
            )
        stages.append(stage)

    min_size = minimum_size_for_target(sequence, target_availability)
    searched_up_to = sequence[-1].size if sequence else 0
    capped = searched_up_to < total_satellites

    return {
        "scenario_id": scenario.get("meta", {}).get("id"),
        "scenario_title": scenario.get("meta", {}).get("title"),
        "routing_strategy": routing_strategy,
        "total_satellites": total_satellites,
        "target_availability": target_availability,
        "method": "greedy_constructive_sweep",
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


def _threshold_point_dict(point: ThresholdPoint, target_availability: float) -> dict[str, Any]:
    return {
        "size": point.size,
        "greedy_worst_availability_percent": point.greedy.worst_availability * 100,
        "refined_worst_availability_percent": point.refined.result.worst_availability * 100,
        "target_margin_pp": target_margin_pp(
            point.refined.result.worst_availability, target_availability
        ),
        "swaps_applied": point.refined.swaps_applied,
        "evaluations": point.refined.evaluations,
        "target_feasible": point.target_feasible,
        "active_satellite_ids": point.refined.result.active_satellite_ids,
        "planes": point.refined.result.planes,
    }


def run_threshold(
    scenario: dict[str, Any],
    routing_strategy: str,
    sizes: list[int],
    *,
    max_passes: int = 3,
    progress: Any = None,
) -> dict[str, Any]:
    """Two phases, reported through the same `progress` callback tagged by
    `phase`: build the greedy sequence up to the largest requested size,
    then run local swap refinement independently at each requested size —
    see `verify_threshold` for why this is materially more than "trust the
    greedy pass"."""
    target_availability = scenario["environment"]["target_availability"]
    max_size = max(sizes)

    def greedy_progress(step: int, cap: int, best: SubsetEvaluation) -> None:
        if progress:
            progress(
                {
                    "phase": "greedy",
                    "step": step,
                    "total": cap,
                    "best_worst_availability": best.worst_availability,
                }
            )

    sequence = greedy_sequence(
        scenario, routing_strategy, max_size=max_size, progress=greedy_progress
    )
    greedy_minimum = minimum_size_for_target(sequence, target_availability)

    def threshold_progress(i: int, total: int, point: ThresholdPoint) -> None:
        if progress:
            progress(
                {
                    "phase": "refine",
                    "step": i,
                    "total": total,
                    "size": point.size,
                    "target_feasible": point.target_feasible,
                }
            )

    points = verify_threshold(
        scenario,
        sequence,
        sizes,
        routing_strategy,
        target_availability,
        max_passes=max_passes,
        progress=threshold_progress,
    )
    verified_minimum = first_verified_pass(points)

    return {
        "scenario_id": scenario.get("meta", {}).get("id"),
        "scenario_title": scenario.get("meta", {}).get("title"),
        "routing_strategy": routing_strategy,
        "target_availability": target_availability,
        "method": "greedy_then_local_swap_refinement",
        "sizes_tested": sorted(set(sizes)),
        "greedy_only_minimum_size": greedy_minimum,
        "first_verified_pass_size": verified_minimum,
        "points": [_threshold_point_dict(p, target_availability) for p in points],
        "marginal_gain_curve": marginal_gain_curve(sequence),
    }


def create_threshold_job(settings: dict[str, Any]) -> str:
    run_id = str(uuid.uuid4())
    with _LOCK:
        _THRESHOLD_JOBS[run_id] = {
            "run_id": run_id,
            "status": "queued",
            "phase": None,
            "evaluated": 0,
            "total": 0,
        }

    def work() -> None:
        with _LOCK:
            _THRESHOLD_JOBS[run_id]["status"] = "running"

        def progress(update: dict[str, Any]) -> None:
            with _LOCK:
                _THRESHOLD_JOBS[run_id].update(
                    phase=update["phase"], evaluated=update["step"], total=update["total"]
                )
                if "best_worst_availability" in update:
                    _THRESHOLD_JOBS[run_id]["best_worst_availability"] = update[
                        "best_worst_availability"
                    ]
                if "size" in update:
                    _THRESHOLD_JOBS[run_id]["current_size"] = update["size"]

        try:
            result = run_threshold(progress=progress, **settings)
            with _LOCK:
                _THRESHOLD_JOBS[run_id].update(status="completed", result=result)
        except Exception as exc:  # pragma: no cover
            with _LOCK:
                _THRESHOLD_JOBS[run_id].update(status="failed", error=str(exc))

    threading.Thread(target=work, name=f"threshold-verify-{run_id}", daemon=True).start()
    return run_id


def get_threshold_job(run_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _THRESHOLD_JOBS.get(run_id)
        return copy.deepcopy(job) if job else None
