from __future__ import annotations

import pytest

from app.calculation.optimization.isl_sensitivity import (
    isl_sweep,
    minimum_isl_for_target,
    refine_isl_boundary,
)
from app.services.scenario_service import get_example


def test_isl_sweep_is_sorted_and_exact() -> None:
    scenario = get_example("01_full_constellation")
    points = isl_sweep(scenario, [3000.0, 1500.0], "minimum_hops")
    assert [p.isl_range_km for p in points] == [1500.0, 3000.0]
    # Shorter range can never do better than a longer one for the same geometry.
    assert points[0].worst_availability <= points[1].worst_availability


def test_isl_sweep_does_not_mutate_source_scenario() -> None:
    scenario = get_example("01_full_constellation")
    original_isl = scenario["environment"]["isl_range_km"]
    isl_sweep(scenario, [1000.0], "minimum_hops")
    assert scenario["environment"]["isl_range_km"] == original_isl


def test_minimum_isl_for_target_picks_smallest_passing() -> None:
    scenario = get_example("01_full_constellation")
    points = isl_sweep(scenario, [1000.0, 3000.0], "minimum_hops")
    target = scenario["environment"]["target_availability"]
    result = minimum_isl_for_target(points, target)
    passing = [p.isl_range_km for p in points if p.worst_availability >= target]
    assert result == (min(passing) if passing else None)


def test_minimum_isl_for_target_returns_none_if_nothing_passes() -> None:
    points = isl_sweep(get_example("01_full_constellation"), [10.0], "minimum_hops")
    assert minimum_isl_for_target(points, 0.9) is None


def test_refine_isl_boundary_stays_within_bounds() -> None:
    scenario = get_example("01_full_constellation")
    refined = refine_isl_boundary(scenario, "minimum_hops", 1000.0, 1150.0, step_km=50.0)
    for point in refined:
        assert 1000.0 < point.isl_range_km <= 1150.0


def test_refine_isl_boundary_rejects_inverted_range() -> None:
    scenario = get_example("01_full_constellation")
    with pytest.raises(ValueError, match="less than"):
        refine_isl_boundary(scenario, "minimum_hops", 2000.0, 1000.0)
