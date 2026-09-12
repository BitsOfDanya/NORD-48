from __future__ import annotations

from app.calculation.resilience.failure_degradation import compute_failure_degradation_curve
from app.services.scenario_service import get_example


def test_k0_is_exact_and_matches_plain_worst_availability() -> None:
    scenario = get_example("01_full_constellation")
    points = compute_failure_degradation_curve(
        scenario, [0], iterations=10, seed=42, routing_strategy="minimum_hops"
    )
    assert len(points) == 1
    point = points[0]
    assert point.k == 0
    assert point.method == "exact"
    assert point.samples == 1
    # Known regression value for this scenario (see docs/calculation-model.md).
    assert abs(point.median_worst_availability_percent - 96.666666666) < 1e-6
    assert point.target_survival_fraction == 1.0


def test_k1_is_exact_and_exhaustive_over_all_satellites() -> None:
    scenario = get_example("01_full_constellation")
    points = compute_failure_degradation_curve(
        scenario, [1], iterations=10, seed=42, routing_strategy="minimum_hops"
    )
    point = points[0]
    assert point.method == "exact"
    assert point.samples == 48  # every active satellite failed once, not sampled
    assert 0 <= point.target_survival_fraction <= 1
    assert point.worst_observed_availability_percent <= point.median_worst_availability_percent


def test_k2_is_exact_and_exhaustive_over_all_pairs() -> None:
    scenario = get_example("01_full_constellation")
    points = compute_failure_degradation_curve(
        scenario, [2], iterations=10, seed=42, routing_strategy="minimum_hops"
    )
    point = points[0]
    assert point.method == "exact"
    assert point.samples == 48 * 47 // 2  # C(48, 2), not sampled
    assert 0 <= point.target_survival_fraction <= 1


def test_k_above_2_uses_monte_carlo_and_is_reproducible() -> None:
    scenario = get_example("01_full_constellation")
    first = compute_failure_degradation_curve(
        scenario, [3], iterations=10, seed=42, routing_strategy="minimum_hops"
    )
    second = compute_failure_degradation_curve(
        scenario, [3], iterations=10, seed=42, routing_strategy="minimum_hops"
    )
    assert first[0].method == "monte_carlo"
    assert first[0].samples == 10
    assert first[0] == second[0]  # fixed seed -> reproducible


def test_curve_is_sorted_ascending_and_deduplicated() -> None:
    scenario = get_example("01_full_constellation")
    points = compute_failure_degradation_curve(
        scenario, [2, 0, 1, 0], iterations=5, seed=1, routing_strategy="minimum_hops"
    )
    assert [p.k for p in points] == [0, 1, 2]


def test_target_survival_fraction_within_bounds_for_monte_carlo() -> None:
    scenario = get_example("01_full_constellation")
    points = compute_failure_degradation_curve(
        scenario, [4, 6], iterations=10, seed=7, routing_strategy="minimum_hops"
    )
    for point in points:
        assert 0.0 <= point.target_survival_fraction <= 1.0
        assert point.method == "monte_carlo"
