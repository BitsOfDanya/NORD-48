"""Integration tests for Monte Carlo resilience stress-testing.

Kept to small `iterations`/`failed_satellites_count` — this exercises the
real geometry + routing pipeline (not mocked), so keeping trial counts
small is what keeps the suite fast; a full-size run (K=5, iterations=100)
is exercised manually — see docs/resilience-analysis.md for measured
runtime.
"""

from __future__ import annotations

import copy

import pytest

from app.calculation.resilience.monte_carlo import run_monte_carlo
from app.services import scenario_service, simulation_service

SCENARIO_ID = "01_full_constellation"
STRATEGIES = ["minimum_hops", "minimum_distance", "maximum_margin"]


def _scenario():
    return scenario_service.get_example(SCENARIO_ID)


def test_seed_reproducibility() -> None:
    scenario = _scenario()
    result_a = run_monte_carlo(scenario, 3, 8, seed=7, strategies=STRATEGIES)
    result_b = run_monte_carlo(scenario, 3, 8, seed=7, strategies=STRATEGIES)

    assert result_a.worst_trial is not None
    assert result_b.worst_trial is not None
    assert result_a.worst_trial.failed_satellites == result_b.worst_trial.failed_satellites
    for sa, sb in zip(result_a.strategies, result_b.strategies, strict=True):
        for ca, cb in zip(sa.per_client, sb.per_client, strict=True):
            assert ca.mean == cb.mean
            assert ca.p95 == cb.p95


def test_different_seed_can_change_result() -> None:
    scenario = _scenario()
    result_a = run_monte_carlo(scenario, 5, 10, seed=1, strategies=["minimum_hops"])
    result_b = run_monte_carlo(scenario, 5, 10, seed=2, strategies=["minimum_hops"])

    assert result_a.worst_trial is not None
    assert result_b.worst_trial is not None
    # Not a hard guarantee for every seed pair, but true for these two —
    # regressing to "always identical" would mean the seed isn't wired in.
    assert result_a.worst_trial.failed_satellites != result_b.worst_trial.failed_satellites


def test_k_zero_matches_baseline_simulation() -> None:
    scenario = _scenario()
    baseline_run = simulation_service.run_simulation(scenario, "minimum_hops")

    mc_result = run_monte_carlo(scenario, 0, 3, seed=1, strategies=["minimum_hops"])

    strategy = mc_result.strategies[0]
    for client_stats in strategy.per_client:
        baseline_fraction = baseline_run.metrics[client_stats.client_id].availability_fraction
        assert client_stats.mean == pytest.approx(baseline_fraction)
        assert client_stats.std == pytest.approx(0.0, abs=1e-9)  # every trial is identical


def test_k_larger_than_fleet_clamps() -> None:
    scenario = _scenario()
    result = run_monte_carlo(scenario, 10_000, 2, seed=1, strategies=["minimum_hops"])

    assert result.failed_satellites_count == result.candidate_satellite_count
    assert result.requested_failed_satellites_count == 10_000


def test_failed_satellites_are_actually_excluded() -> None:
    scenario = _scenario()
    result = run_monte_carlo(scenario, 5, 6, seed=3, strategies=["minimum_hops"])

    assert result.worst_trial is not None
    failed = set(result.worst_trial.failed_satellites)
    # A failed satellite can never be part of the path that produced the
    # reported availability for the worst trial's headline client.
    assert len(failed) == 5


def test_all_clients_target_fraction_in_unit_range() -> None:
    scenario = _scenario()
    result = run_monte_carlo(scenario, 5, 6, seed=4, strategies=STRATEGIES)

    for strategy in result.strategies:
        assert 0.0 <= strategy.all_clients_target_fraction <= 1.0
        assert 0.0 <= strategy.p05_worst_client_availability <= 1.0
        for client_stats in strategy.per_client:
            assert 0.0 <= client_stats.target_success_fraction <= 1.0


def test_recommended_strategy_is_deterministic() -> None:
    scenario = _scenario()
    result_a = run_monte_carlo(scenario, 3, 6, seed=9, strategies=STRATEGIES)
    result_b = run_monte_carlo(scenario, 3, 6, seed=9, strategies=STRATEGIES)

    assert result_a.recommended_strategy == result_b.recommended_strategy
    assert result_a.recommended_reason == result_b.recommended_reason


def test_recommended_strategy_is_one_of_requested() -> None:
    scenario = _scenario()
    result = run_monte_carlo(scenario, 3, 5, seed=11, strategies=STRATEGIES)

    assert result.recommended_strategy in STRATEGIES


def test_does_not_mutate_original_scenario() -> None:
    scenario = _scenario()
    snapshot_before = copy.deepcopy(scenario)

    run_monte_carlo(scenario, 5, 4, seed=5, strategies=STRATEGIES)

    assert scenario == snapshot_before


def test_iterations_count_reflected_in_target_fraction_denominator() -> None:
    scenario = _scenario()
    iterations = 7
    result = run_monte_carlo(scenario, 2, iterations, seed=6, strategies=["minimum_hops"])

    assert result.iterations == iterations
    # target_success_fraction must be a multiple of 1/iterations.
    for client_stats in result.strategies[0].per_client:
        scaled = client_stats.target_success_fraction * iterations
        assert abs(scaled - round(scaled)) < 1e-9
