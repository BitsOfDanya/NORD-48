"""K-satellite failure degradation curve.

Orchestration, not a new failure model: K=0 is one plain exact simulation;
K=1 reuses the exact, exhaustive `run_n1_criticality` (all N single
failures, not sampled); K=2 reuses the exact, exhaustive `run_exact_n2`
(all N*(N-1)/2 pairs); K>=3 switches to `run_monte_carlo` (exhaustive
enumeration of all K-subsets is combinatorially infeasible beyond K=2 —
see docs/resilience-analysis.md for why Monte Carlo is the established
approach here). Every point reports which method produced it so callers
never conflate an exact, exhaustive result with a sampled estimate.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from app.calculation.resilience.failure_analysis import (
    _client_metrics,
    build_graph_timeline,
    compute_timeline,
    run_n1_criticality,
)
from app.calculation.resilience.failure_threshold import run_exact_n2
from app.calculation.resilience.monte_carlo import run_monte_carlo

Method = Literal["exact", "monte_carlo"]


@dataclass
class DegradationPoint:
    k: int
    method: Method
    median_worst_availability_percent: float
    p10_worst_availability_percent: float
    worst_observed_availability_percent: float
    target_survival_fraction: float
    samples: int


def _percentile(values: list[float], q: float) -> float:
    return float(np.percentile(np.asarray(values, dtype=float), q))


def _k0_point(scenario: dict[str, Any], routing_strategy: str) -> DegradationPoint:
    """K=0 — the plain scenario, no failures at all. Exact by construction."""
    graphs = build_graph_timeline(scenario)
    timeline = compute_timeline(scenario, graphs, routing_strategy)
    percents = [
        _client_metrics(scenario, client_id, records).availability_percent
        for client_id, records in timeline.items()
    ]
    worst = min(percents)
    target_percent = scenario["environment"]["target_availability"] * 100
    return DegradationPoint(
        k=0,
        method="exact",
        median_worst_availability_percent=worst,
        p10_worst_availability_percent=worst,
        worst_observed_availability_percent=worst,
        target_survival_fraction=1.0 if worst >= target_percent else 0.0,
        samples=1,
    )


def _k1_point(scenario: dict[str, Any], routing_strategy: str) -> DegradationPoint:
    """K=1 — exact, exhaustive: every one of the N active satellites failed
    individually (not sampled)."""
    horizon_s = scenario["environment"]["horizon_s"]
    result = run_n1_criticality(scenario, 0, horizon_s, routing_strategy)
    rows = result["ranking"]
    values = [row["worst_client_availability_percent"] for row in rows]
    survival = sum(row["target_violations_count"] == 0 for row in rows) / len(rows) if rows else 0.0
    return DegradationPoint(
        k=1,
        method="exact",
        median_worst_availability_percent=_percentile(values, 50) if values else 0.0,
        p10_worst_availability_percent=_percentile(values, 10) if values else 0.0,
        worst_observed_availability_percent=min(values, default=0.0),
        target_survival_fraction=survival,
        samples=len(rows),
    )


def _k2_point(scenario: dict[str, Any], routing_strategy: str) -> DegradationPoint:
    """K=2 — exact, exhaustive: every one of the N*(N-1)/2 satellite pairs
    (not sampled, not just the reported top-20 worst)."""
    horizon_s = scenario["environment"]["horizon_s"]
    result = run_exact_n2(scenario, 0, horizon_s, routing_strategy)
    stats = result["pair_worst_availability_stats"]
    return DegradationPoint(
        k=2,
        method="exact",
        median_worst_availability_percent=stats["median_percent"],
        p10_worst_availability_percent=stats["p10_percent"],
        worst_observed_availability_percent=stats["min_percent"],
        target_survival_fraction=stats["target_survival_fraction"],
        samples=stats["combinations_evaluated"],
    )


def _k_monte_carlo_point(
    scenario: dict[str, Any], k: int, iterations: int, seed: int, routing_strategy: str
) -> DegradationPoint:
    result = run_monte_carlo(
        scenario=scenario,
        failed_satellites_count=k,
        iterations=iterations,
        seed=seed,
        strategies=[routing_strategy],
    )
    summary = next(s for s in result.strategies if s.strategy == routing_strategy)
    return DegradationPoint(
        k=k,
        method="monte_carlo",
        median_worst_availability_percent=summary.median_worst_client_availability * 100,
        p10_worst_availability_percent=summary.p10_worst_client_availability * 100,
        worst_observed_availability_percent=summary.min_worst_client_availability * 100,
        target_survival_fraction=summary.all_clients_target_fraction,
        samples=iterations,
    )


def compute_failure_degradation_curve(
    scenario: dict[str, Any],
    k_values: list[int],
    *,
    iterations: int,
    seed: int,
    routing_strategy: str,
    progress: Any = None,
) -> list[DegradationPoint]:
    """One point per requested K, in ascending order, using the cheapest
    exact method available for K<=2 and Monte Carlo above that."""
    points: list[DegradationPoint] = []
    for k in sorted(set(k_values)):
        if k == 0:
            point = _k0_point(scenario, routing_strategy)
        elif k == 1:
            point = _k1_point(scenario, routing_strategy)
        elif k == 2:
            point = _k2_point(scenario, routing_strategy)
        else:
            point = _k_monte_carlo_point(scenario, k, iterations, seed, routing_strategy)
        points.append(point)
        if progress:
            progress(len(points), len(k_values), point)
    return points
