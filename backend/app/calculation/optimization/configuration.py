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


def _dominates(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """True if `left` is at least as good as `right` on every objective and
    strictly better on at least one — the standard Pareto dominance test."""
    lm, rm = left["aggregates"], right["aggregates"]
    no_worse = (
        lm["target_violations"] <= rm["target_violations"]
        and lm["worst_availability"] >= rm["worst_availability"]
        and lm["mean_availability"] >= rm["mean_availability"]
        and lm["worst_max_outage_s"] <= rm["worst_max_outage_s"]
    )
    strictly_better = (
        lm["target_violations"] < rm["target_violations"]
        or lm["worst_availability"] > rm["worst_availability"]
        or lm["mean_availability"] > rm["mean_availability"]
        or lm["worst_max_outage_s"] < rm["worst_max_outage_s"]
    )
    return no_worse and strictly_better


def pareto_frontier(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Candidates no other EVALUATED candidate dominates on all four
    objectives at once (`target_violations`, `worst_availability`,
    `mean_availability`, `worst_max_outage_s`) — real multi-objective
    dominance, not a top-N by a single scalar score."""
    return [
        candidate
        for candidate in candidates
        if not any(_dominates(other, candidate) for other in candidates if other is not candidate)
    ]


def normal_scenario_row(candidate: dict[str, Any], normal_profile: str) -> dict[str, Any]:
    return next(row for row in candidate["scenarios"] if row["profile"] == normal_profile)


def degraded_worst_availability(candidate: dict[str, Any], normal_profile: str) -> float:
    values = [
        c["availability"]
        for row in candidate["scenarios"]
        if row["profile"] != normal_profile
        for c in row["clients"]
    ]
    return min(values) if values else candidate["aggregates"]["worst_availability"]


def normal_target_shortfall(
    candidate: dict[str, Any], normal_profile: str, target_availability: float
) -> float:
    row = normal_scenario_row(candidate, normal_profile)
    return sum(max(0.0, target_availability - c["availability"]) for c in row["clients"])


def constrained_robust_scalar(
    candidate: dict[str, Any], normal_profile: str, target_availability: float
) -> float:
    """Lower is better — this is what scipy DE minimizes directly.

    Two tiers folded into one continuous scalar so DE still gets a useful
    gradient even while infeasible: a candidate that fails the normal-mode
    constraint (target_availability for every client in `normal_profile`)
    always scores >= 1.0, driven down toward 1.0 by shrinking its
    shortfall; a candidate that satisfies the constraint always scores
    < 1.0, ordered by how much degraded-scenario worst availability it
    preserves. The two tiers never overlap, so ranking by this scalar
    alone already prefers every feasible candidate over every infeasible
    one — no separate constraint check is needed downstream.
    """
    shortfall = normal_target_shortfall(candidate, normal_profile, target_availability)
    if shortfall > 0:
        return 1.0 + shortfall
    return 1.0 - degraded_worst_availability(candidate, normal_profile)


def constrained_robust_rank_key(
    candidate: dict[str, Any], normal_profile: str, target_availability: float
) -> tuple[Any, ...]:
    """Constraint: every client in `normal_profile` reaches
    `target_availability`. Objective: maximize the worst availability
    among all OTHER (degraded) profiles. Tie-break, in order: less worst
    outage; higher normal-profile worst availability; less parameter
    deviation from baseline."""
    metrics = candidate["aggregates"]
    normal_row = normal_scenario_row(candidate, normal_profile)
    return (
        constrained_robust_scalar(candidate, normal_profile, target_availability),
        metrics["worst_max_outage_s"],
        -normal_row["worst_availability"],
        metrics["parameter_deviation_deg"],
        canonical_parameters(candidate["parameters"]),
    )


def degraded_profile_worst_availability(candidate: dict[str, Any], profile: str) -> float:
    """Worst client availability within ONE named profile (not pooled
    across profiles like `degraded_worst_availability`)."""
    row = normal_scenario_row(candidate, profile)
    return min(c["availability"] for c in row["clients"])


def degraded_profile_mean_availability(candidate: dict[str, Any], profile: str) -> float:
    row = normal_scenario_row(candidate, profile)
    return fmean(c["availability"] for c in row["clients"])


def robust_primary_metric(
    candidate: dict[str, Any], degraded_profiles: tuple[str, ...]
) -> float:
    """`min(outages_worst, isl2000_worst)` — equivalent to
    `degraded_worst_availability` when `degraded_profiles` is exactly the
    set of non-normal profiles (min of per-profile worsts == min of the
    pooled set), but explicit about being a min-of-profile-worsts so it
    stays correct even if more degraded profiles are added later."""
    worsts = [degraded_profile_worst_availability(candidate, profile) for profile in degraded_profiles]
    return min(worsts) if worsts else 0.0


def robust_secondary_metric(
    candidate: dict[str, Any], degraded_profiles: tuple[str, ...]
) -> float:
    """`min(outages_mean, isl2000_mean)` — secondary tie-break: prefer the
    candidate whose worse-off degraded profile is doing better on AVERAGE
    too, not just at its single worst client."""
    means = [degraded_profile_mean_availability(candidate, profile) for profile in degraded_profiles]
    return min(means) if means else 0.0


def robust_design_scalar(
    candidate: dict[str, Any],
    normal_profile: str,
    degraded_profiles: tuple[str, ...],
    target_availability: float,
) -> float:
    """Lower is better — same two-tier shape as `constrained_robust_scalar`
    (Gate 1: every normal-profile client >= target; below that, maximize
    `robust_primary_metric`), scoped to exactly the named degraded
    profiles rather than every non-normal profile pooled together."""
    shortfall = normal_target_shortfall(candidate, normal_profile, target_availability)
    if shortfall > 0:
        return 1.0 + shortfall
    return 1.0 - robust_primary_metric(candidate, degraded_profiles)


def robust_design_rank_key(
    candidate: dict[str, Any],
    normal_profile: str,
    degraded_profiles: tuple[str, ...],
    target_availability: float,
) -> tuple[Any, ...]:
    """Canonical lexicographic objective for Robust Design Search 2.0
    (docs/robust-design-search.md):

    Gate 1 (every normal client >= target) + PRIMARY
        (`max min(outages_worst, isl2000_worst)`) folded into one
        continuous tier via `robust_design_scalar`, exactly like
        `constrained_robust_rank_key` does for its own primary objective.
    SECONDARY: `max min(outages_mean, isl2000_mean)`.
    THIRD: `min worst_max_outage_s`.
    FOURTH (backup-path availability) is deliberately NOT here — it needs
        a route-redundancy pass per candidate, too expensive to run for
        every candidate a search budget evaluates; it is applied instead
        as a finalist-only tie-break (see
        `app.services.robust_design_service`).
    FIFTH: `min parameter_deviation_deg` from baseline.
    Final: canonical parameter tuple, purely for determinism.
    """
    metrics = candidate["aggregates"]
    return (
        robust_design_scalar(candidate, normal_profile, degraded_profiles, target_availability),
        -robust_secondary_metric(candidate, degraded_profiles),
        metrics["worst_max_outage_s"],
        metrics["parameter_deviation_deg"],
        canonical_parameters(candidate["parameters"]),
    )
