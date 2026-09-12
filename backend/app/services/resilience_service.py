"""Resilience analysis: Monte Carlo stress-testing of random satellite
failure combinations across routing strategies.

Orchestration only — the actual computation lives in
`app.calculation.resilience.monte_carlo`, which reuses the exact
simulation pipeline (geometry, graph, routing, diagnostics) unmodified.
"""

from __future__ import annotations

from typing import Any

from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.resilience.connectivity_margin import (
    compute_at_timestamp,
    compute_daily,
)
from app.calculation.resilience.failure_analysis import (
    run_failure_analysis,
    run_n1_criticality,
)
from app.calculation.resilience.failure_threshold import run_exact_n2
from app.calculation.resilience.monte_carlo import MonteCarloResult, run_monte_carlo
from app.calculation.resilience.redundancy import run_redundancy_analysis
from app.calculation.resilience.routing_analysis import run_routing_analysis


def run_experiment(
    scenario: dict[str, Any],
    failed_satellites_count: int,
    iterations: int,
    seed: int,
    strategies: list[str],
    client_ids: list[str] | None = None,
) -> MonteCarloResult:
    geometry_adapter.validate_scenario(scenario)
    return run_monte_carlo(
        scenario=scenario,
        failed_satellites_count=failed_satellites_count,
        iterations=iterations,
        seed=seed,
        strategies=strategies,
        client_ids=client_ids,
    )


def analyze_routing(
    scenario: dict[str, Any], strategies: list[str] | None = None
) -> dict[str, Any]:
    geometry_adapter.validate_scenario(scenario)
    return run_routing_analysis(scenario, strategies)


def analyze_failure(
    scenario: dict[str, Any],
    satellite_ids: list[str],
    failure_start_s: int,
    failure_end_s: int,
    routing_strategy: str,
) -> dict[str, Any]:
    geometry_adapter.validate_scenario(scenario)
    return run_failure_analysis(
        scenario,
        satellite_ids,
        failure_start_s,
        failure_end_s,
        routing_strategy,
    )


def analyze_n1(
    scenario: dict[str, Any],
    analysis_start_s: int,
    analysis_end_s: int,
    routing_strategy: str,
) -> dict[str, Any]:
    geometry_adapter.validate_scenario(scenario)
    return run_n1_criticality(
        scenario, analysis_start_s, analysis_end_s, routing_strategy
    )


def analyze_n2(
    scenario: dict[str, Any],
    analysis_start_s: int,
    analysis_end_s: int,
    routing_strategy: str,
) -> dict[str, Any]:
    geometry_adapter.validate_scenario(scenario)
    return run_exact_n2(scenario, analysis_start_s, analysis_end_s, routing_strategy)


def analyze_redundancy(scenario: dict[str, Any], routing_strategy: str) -> dict[str, Any]:
    geometry_adapter.validate_scenario(scenario)
    return run_redundancy_analysis(scenario, routing_strategy)


def analyze_connectivity_margin(
    scenario: dict[str, Any], client_id: str, t_s: float
) -> dict[str, Any]:
    geometry_adapter.validate_scenario(scenario)
    return compute_at_timestamp(scenario, client_id, t_s)


def analyze_daily_connectivity(
    scenario: dict[str, Any], client_id: str
) -> dict[str, Any]:
    geometry_adapter.validate_scenario(scenario)
    return compute_daily(scenario, client_id)
