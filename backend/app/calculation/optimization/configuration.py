"""Exact, deterministic evaluation of derived constellation configurations."""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, field
from statistics import fmean
from typing import Any, cast

from app.calculation.resilience.failure_analysis import (
    _client_metrics,
    build_graph_timeline,
    compute_timeline,
)

ParameterMap = dict[str, float]


def normalize_angle(value: float) -> float:
    """Normalize an angle to the range accepted by reference geometry."""
    return float(value % 360.0)


def plane_parameters(scenario: dict[str, Any]) -> ParameterMap:
    return {
        f"{plane['id']}.{field}": float(plane[field])
        for plane in scenario["design"]["planes"]
        for field in ("raan_deg", "phase_deg")
    }


def apply_plane_parameters(
    scenario: dict[str, Any], parameters: ParameterMap
) -> dict[str, Any]:
    """Return a validated-shape deep copy with only plane angles changed."""
    derived = copy.deepcopy(scenario)
    planes = {plane["id"]: plane for plane in derived["design"]["planes"]}
    for name, value in parameters.items():
        try:
            plane_id, field_name = name.split(".", 1)
        except ValueError as exc:
            raise ValueError(f"invalid parameter name: {name}") from exc
        if plane_id not in planes or field_name not in {"raan_deg", "phase_deg"}:
            raise ValueError(f"unknown optimizable plane parameter: {name}")
        planes[plane_id][field_name] = normalize_angle(value)
    derived["meta"] = dict(derived.get("meta", {}))
    derived["meta"]["id"] = f"{derived['meta'].get('id', 'scenario')}__optimized"
    derived["meta"]["derived_from"] = scenario.get("meta", {}).get("id")
    return derived


def canonical_parameters(parameters: ParameterMap) -> tuple[tuple[str, float], ...]:
    return tuple(sorted((name, round(normalize_angle(value), 8)) for name, value in parameters.items()))


def scenario_signature(scenarios: dict[str, dict[str, Any]]) -> str:
    raw = json.dumps(scenarios, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(raw.encode()).hexdigest()


@dataclass
class EvaluationCache:
    values: dict[tuple[Any, ...], dict[str, Any]] = field(default_factory=dict)
    hits: int = 0
    misses: int = 0

    def key(
        self, scenarios: dict[str, dict[str, Any]], parameters: ParameterMap, strategy: str
    ) -> tuple[Any, ...]:
        return (scenario_signature(scenarios), canonical_parameters(parameters), strategy)


def _parameter_deviation(
    parameters: ParameterMap, baseline_parameters: ParameterMap
) -> float:
    deviations = []
    for name, value in parameters.items():
        baseline = baseline_parameters[name]
        delta = abs(normalize_angle(value) - normalize_angle(baseline))
        deviations.append(min(delta, 360.0 - delta))
    return fmean(deviations) if deviations else 0.0


def evaluate_configuration(
    scenarios: dict[str, dict[str, Any]],
    parameters: ParameterMap,
    routing_strategy: str,
    *,
    baseline_parameters: ParameterMap | None = None,
    cache: EvaluationCache | None = None,
    bypass_cache: bool = False,
) -> dict[str, Any]:
    """Evaluate the same angles in every stress profile with the exact pipeline."""
    cache_key = cache.key(scenarios, parameters, routing_strategy) if cache else None
    if cache and not bypass_cache and cache_key in cache.values:
        cache.hits += 1
        return copy.deepcopy(cache.values[cache_key])
    if cache:
        cache.misses += 1

    scenario_results: list[dict[str, Any]] = []
    all_clients: list[dict[str, Any]] = []
    for profile, scenario in scenarios.items():
        derived = apply_plane_parameters(scenario, parameters)
        graphs = build_graph_timeline(derived)
        timeline = compute_timeline(derived, graphs, routing_strategy)
        clients = []
        for client_id, records in sorted(timeline.items()):
            metrics = _client_metrics(derived, client_id, records)
            item = {
                "client_id": client_id,
                "availability": metrics.availability_fraction,
                "availability_percent": metrics.availability_percent,
                "max_outage_s": metrics.max_outage_s,
                "route_change_count": metrics.route_change_count,
                "mean_hops": metrics.average_hops,
                "target_reached": metrics.target_achieved,
            }
            clients.append(item)
            all_clients.append({"scenario": profile, **item})
        availability_values = [cast(float, c["availability"]) for c in clients]
        scenario_results.append(
            {
                "profile": profile,
                "scenario_id": scenario.get("meta", {}).get("id"),
                "isl_range_km": scenario["environment"]["isl_range_km"],
                "failure_count": len(scenario.get("failures", [])),
                "clients": clients,
                "worst_availability": min(availability_values),
                "target_violations": sum(not c["target_reached"] for c in clients),
            }
        )

    all_availability = [cast(float, c["availability"]) for c in all_clients]
    result: dict[str, Any] = {
        "parameters": {name: normalize_angle(value) for name, value in sorted(parameters.items())},
        "scenarios": scenario_results,
        "aggregates": {
            "worst_availability": min(all_availability),
            "mean_availability": fmean(all_availability),
            "worst_max_outage_s": max(c["max_outage_s"] for c in all_clients),
            "mean_max_outage_s": fmean(c["max_outage_s"] for c in all_clients),
            "route_churn": sum(c["route_change_count"] for c in all_clients),
            "target_violations": sum(not c["target_reached"] for c in all_clients),
            "conditions": len(all_clients),
            "target_feasible": all(c["target_reached"] for c in all_clients),
            "parameter_deviation_deg": _parameter_deviation(
                parameters, baseline_parameters or parameters
            ),
        },
    }
    if cache and cache_key is not None:
        cache.values[cache_key] = copy.deepcopy(result)
    return result


def candidate_rank_key(candidate: dict[str, Any]) -> tuple[Any, ...]:
    """Lexicographic objective exactly matching the documented priorities."""
    metrics = candidate["aggregates"]
    return (
        -metrics["worst_availability"],
        metrics["worst_max_outage_s"],
        -metrics["mean_availability"],
        metrics["mean_max_outage_s"],
        metrics["route_churn"],
        metrics["parameter_deviation_deg"],
        canonical_parameters(candidate["parameters"]),
    )
