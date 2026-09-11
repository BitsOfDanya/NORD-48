"""Constrained multi-objective search verified by the exact simulator.

The optimizer is only a search policy: every candidate is evaluated by
``simulation_service.run_simulation`` and therefore uses the organizers'
reference geometry, the production routing rules, and the original time grid.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.optimize import differential_evolution

from app.services import scenario_service, simulation_service


@dataclass(frozen=True)
class Objectives:
    target_shortfall: float
    worst_availability: float
    mean_availability: float
    worst_max_outage_s: int


def _angles(scenario: dict[str, Any]) -> np.ndarray:
    return np.array(
        [
            value
            for plane in scenario["design"]["planes"]
            for value in (plane["raan_deg"], plane["phase_deg"])
        ],
        dtype=float,
    )


def _apply_angles(scenario: dict[str, Any], angles: np.ndarray) -> dict[str, Any]:
    candidate = copy.deepcopy(scenario)
    for index, plane in enumerate(candidate["design"]["planes"]):
        plane["raan_deg"] = round(float(angles[index * 2] % 360), 6)
        plane["phase_deg"] = round(float(angles[index * 2 + 1] % 360), 6)
    return candidate


def _evaluate(
    scenarios: list[dict[str, Any]], angles: np.ndarray, routing_strategy: str
) -> tuple[Objectives, list[dict[str, Any]]]:
    metrics: list[dict[str, Any]] = []
    availability: list[float] = []
    target_shortfall = 0.0
    worst_max_outage_s = 0
    for source in scenarios:
        candidate = _apply_angles(source, angles)
        run = simulation_service.run_simulation(
            candidate, routing_strategy, persist=False
        )
        scenario_metrics = {}
        target = candidate["environment"]["target_availability"]
        for client_id, metric in run.metrics.items():
            availability.append(metric.availability_fraction)
            target_shortfall += max(0.0, target - metric.availability_fraction)
            worst_max_outage_s = max(worst_max_outage_s, metric.max_outage_s)
            scenario_metrics[client_id] = {
                "availability_percent": metric.availability_percent,
                "max_outage_s": metric.max_outage_s,
                "target_achieved": metric.target_achieved,
            }
        metrics.append(
            {
                "scenario_id": candidate.get("meta", {}).get("id"),
                "clients": scenario_metrics,
            }
        )
    objectives = Objectives(
        target_shortfall=target_shortfall,
        worst_availability=min(availability),
        mean_availability=float(np.mean(availability)),
        worst_max_outage_s=worst_max_outage_s,
    )
    return objectives, metrics


def _scalar_score(objectives: Objectives, horizon_s: int) -> float:
    """Strictly prioritize target deficits, then worst-client quality."""
    return (
        objectives.target_shortfall * 1_000_000.0
        + (1.0 - objectives.worst_availability) * 1_000.0
        + objectives.worst_max_outage_s / horizon_s * 10.0
        + (1.0 - objectives.mean_availability)
    )


def _dominates(left: Objectives, right: Objectives) -> bool:
    no_worse = (
        left.target_shortfall <= right.target_shortfall
        and left.worst_availability >= right.worst_availability
        and left.mean_availability >= right.mean_availability
        and left.worst_max_outage_s <= right.worst_max_outage_s
    )
    strictly_better = (
        left.target_shortfall < right.target_shortfall
        or left.worst_availability > right.worst_availability
        or left.mean_availability > right.mean_availability
        or left.worst_max_outage_s < right.worst_max_outage_s
    )
    return no_worse and strictly_better


def _candidate_dict(
    angles: np.ndarray, objectives: Objectives, metrics: list[dict[str, Any]], score: float
) -> dict[str, Any]:
    return {
        "angles": [round(float(value % 360), 6) for value in angles],
        "objectives": {
            "target_shortfall": objectives.target_shortfall,
            "worst_availability_percent": objectives.worst_availability * 100,
            "mean_availability_percent": objectives.mean_availability * 100,
            "worst_max_outage_s": objectives.worst_max_outage_s,
        },
        "score": score,
        "scenario_metrics": metrics,
    }


def optimize(
    primary_scenario: dict[str, Any],
    robustness_scenarios: list[dict[str, Any]],
    *,
    routing_strategy: str,
    maxiter: int,
    popsize: int,
    seed: int,
    pareto_limit: int,
) -> dict[str, Any]:
    scenarios = [primary_scenario, *robustness_scenarios]
    n_planes = len(primary_scenario["design"]["planes"])
    plane_ids = [plane["id"] for plane in primary_scenario["design"]["planes"]]
    if any(
        [plane["id"] for plane in item["design"]["planes"]] != plane_ids
        for item in scenarios
    ):
        raise ValueError("All optimization scenarios must have identical ordered plane IDs")
    time_grid = (
        primary_scenario["environment"]["horizon_s"],
        primary_scenario["environment"]["step_s"],
    )
    if any(
        (item["environment"]["horizon_s"], item["environment"]["step_s"])
        != time_grid
        for item in scenarios
    ):
        raise ValueError("All optimization scenarios must use the same time grid")

    cache: dict[tuple[float, ...], tuple[Objectives, list[dict[str, Any]], np.ndarray]] = {}
    horizon_s = primary_scenario["environment"]["horizon_s"]

    def objective(raw_angles: np.ndarray) -> float:
        normalized = np.mod(raw_angles, 360.0)
        key = tuple(round(float(value), 6) for value in normalized)
        if key not in cache:
            values, metrics = _evaluate(scenarios, normalized, routing_strategy)
            cache[key] = (values, metrics, normalized.copy())
        return _scalar_score(cache[key][0], horizon_s)

    baseline_angles = _angles(primary_scenario)
    objective(baseline_angles)
    result = differential_evolution(
        objective,
        bounds=[(0.0, 360.0)] * (n_planes * 2),
        maxiter=maxiter,
        popsize=popsize,
        seed=seed,
        x0=baseline_angles,
        polish=False,
        updating="immediate",
        tol=0.0,
    )
    objective(result.x)

    entries = list(cache.values())
    frontier = [
        entry
        for entry in entries
        if not any(_dominates(other[0], entry[0]) for other in entries if other is not entry)
    ]
    frontier.sort(key=lambda entry: _scalar_score(entry[0], horizon_s))
    best_objectives, best_metrics, best_angles = min(
        entries, key=lambda entry: _scalar_score(entry[0], horizon_s)
    )
    baseline_objectives, baseline_metrics, _ = cache[
        tuple(round(float(value), 6) for value in baseline_angles)
    ]
    recommended_scenario = _apply_angles(primary_scenario, best_angles)
    source_id = primary_scenario.get("meta", {}).get("id", "scenario")
    recommended_scenario["meta"] = {
        **recommended_scenario.get("meta", {}),
        "id": f"{source_id}_optimized",
        "title": f"{primary_scenario.get('meta', {}).get('title', source_id)} — оптимизированный вариант",
    }

    return {
        "method": "scipy_differential_evolution_exact_verification",
        "evaluated_candidates": len(cache),
        "optimization_scenario_ids": [
            scenario.get("meta", {}).get("id") for scenario in scenarios
        ],
        "baseline": _candidate_dict(
            baseline_angles,
            baseline_objectives,
            baseline_metrics,
            _scalar_score(baseline_objectives, horizon_s),
        ),
        "recommended": _candidate_dict(
            best_angles,
            best_objectives,
            best_metrics,
            _scalar_score(best_objectives, horizon_s),
        ),
        "recommended_scenario": recommended_scenario,
        "pareto_front": [
            _candidate_dict(angles, objectives, metrics, _scalar_score(objectives, horizon_s))
            for objectives, metrics, angles in frontier[:pareto_limit]
        ],
    }


def optimize_request(
    *,
    scenario_id: str | None,
    scenario: dict[str, Any] | None,
    robustness_scenario_ids: list[str],
    routing_strategy: str,
    maxiter: int,
    popsize: int,
    seed: int,
    pareto_limit: int,
) -> dict[str, Any]:
    primary = (
        scenario_service.get_example(scenario_id)
        if scenario_id
        else scenario_service.parse_and_validate(scenario or {})
    )
    robustness = [scenario_service.get_example(item) for item in robustness_scenario_ids]
    return optimize(
        primary,
        robustness,
        routing_strategy=routing_strategy,
        maxiter=maxiter,
        popsize=popsize,
        seed=seed,
        pareto_limit=pareto_limit,
    )
