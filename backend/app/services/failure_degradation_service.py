"""In-memory asynchronous jobs for the K-satellite failure degradation
curve — same pattern as `deployment_planner_service.py`/
`optimization_service.py` (in-memory job dict + background thread), not a
new architecture.
"""

from __future__ import annotations

import copy
import threading
import uuid
from dataclasses import asdict
from typing import Any

from app.calculation.resilience.failure_degradation import (
    DegradationPoint,
    compute_failure_degradation_curve,
)

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _point_dict(point: DegradationPoint) -> dict[str, Any]:
    return asdict(point)


def run_curve(
    scenario: dict[str, Any],
    k_values: list[int],
    *,
    iterations: int,
    seed: int,
    routing_strategy: str,
    progress: Any = None,
) -> dict[str, Any]:
    points = compute_failure_degradation_curve(
        scenario,
        k_values,
        iterations=iterations,
        seed=seed,
        routing_strategy=routing_strategy,
        progress=progress,
    )
    return {
        "scenario_id": scenario.get("meta", {}).get("id"),
        "scenario_title": scenario.get("meta", {}).get("title"),
        "routing_strategy": routing_strategy,
        "target_availability": scenario["environment"]["target_availability"],
        "iterations": iterations,
        "seed": seed,
        "points": [_point_dict(p) for p in points],
    }


def create_job(settings: dict[str, Any]) -> str:
    run_id = str(uuid.uuid4())
    total = len(set(settings["k_values"]))
    with _LOCK:
        _JOBS[run_id] = {
            "run_id": run_id,
            "status": "queued",
            "evaluated": 0,
            "total": total,
            "current_k": None,
        }

    def work() -> None:
        with _LOCK:
            _JOBS[run_id]["status"] = "running"

        def progress(step: int, cap: int, point: DegradationPoint) -> None:
            with _LOCK:
                _JOBS[run_id].update(evaluated=step, total=cap, current_k=point.k)

        try:
            result = run_curve(progress=progress, **settings)
            with _LOCK:
                _JOBS[run_id].update(status="completed", result=result)
        except Exception as exc:  # pragma: no cover
            with _LOCK:
                _JOBS[run_id].update(status="failed", error=str(exc))

    threading.Thread(target=work, name=f"failure-degradation-{run_id}", daemon=True).start()
    return run_id


def get_job(run_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _JOBS.get(run_id)
        return copy.deepcopy(job) if job else None
