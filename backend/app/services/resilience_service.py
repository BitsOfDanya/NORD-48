"""Resilience analysis: Monte Carlo stress-testing of random satellite
failure combinations across routing strategies.

Orchestration only — the actual computation lives in
`app.calculation.resilience.monte_carlo`, which reuses the exact
simulation pipeline (geometry, graph, routing, diagnostics) unmodified.
"""

from __future__ import annotations

from typing import Any

from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.resilience.monte_carlo import MonteCarloResult, run_monte_carlo
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
