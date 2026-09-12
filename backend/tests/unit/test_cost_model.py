from __future__ import annotations

import pytest

from app.calculation.economics.cost_model import (
    CostAssumptions,
    cost_per_availability_point,
    estimate_cost,
    estimated_cost_delta,
    incremental_cost_per_pp,
    resource_summary,
)


def test_resource_summary_has_no_currency_fields() -> None:
    summary = resource_summary(45, 48, launch_batches_used=3, launch_capacity_satellites=16)
    assert summary.satellite_count == 45
    assert summary.total_satellites == 48
    assert summary.estimated_launches == 3  # ceil(45/16) = 3
    assert not hasattr(summary, "cost")


def test_resource_summary_without_launch_capacity_leaves_launches_none() -> None:
    summary = resource_summary(45, 48, launch_batches_used=3)
    assert summary.estimated_launches is None


def test_estimate_cost_returns_none_without_unit_cost() -> None:
    assert estimate_cost(45, CostAssumptions()) is None


def test_estimate_cost_basic_arithmetic_is_transparent() -> None:
    assumptions = CostAssumptions(
        satellite_unit_cost_rub=10_000_000,
        launch_fixed_cost_rub=10_000_000,
        launch_capacity_satellites=16,
    )
    cost = estimate_cost(45, assumptions)
    assert cost is not None
    assert cost.estimated_satellite_cost_rub == 45 * 10_000_000
    assert cost.estimated_launches == 3  # ceil(45/16)
    assert cost.estimated_launch_cost_rub == 3 * 10_000_000
    assert cost.estimated_total_rub == cost.estimated_satellite_cost_rub + cost.estimated_launch_cost_rub


def test_estimate_cost_applies_integration_and_reserve() -> None:
    assumptions = CostAssumptions(
        satellite_unit_cost_rub=1_000_000,
        integration_cost_rub=500_000,
        reserve_percent=10.0,
    )
    cost = estimate_cost(10, assumptions)
    assert cost is not None
    subtotal = 10 * 1_000_000 + 500_000
    assert cost.estimated_total_rub == pytest.approx(subtotal * 1.10)


def test_estimate_cost_without_launch_info_has_zero_launch_cost() -> None:
    cost = estimate_cost(10, CostAssumptions(satellite_unit_cost_rub=1_000_000))
    assert cost is not None
    assert cost.estimated_launches is None
    assert cost.estimated_launch_cost_rub == 0.0


def test_cost_per_availability_point_is_plain_ratio() -> None:
    cost = estimate_cost(10, CostAssumptions(satellite_unit_cost_rub=1_000_000))
    assert cost is not None
    result = cost_per_availability_point(cost, 90.0)
    assert result == pytest.approx(cost.estimated_total_rub / 90.0)


def test_cost_per_availability_point_none_for_zero_availability() -> None:
    cost = estimate_cost(10, CostAssumptions(satellite_unit_cost_rub=1_000_000))
    assert cost is not None
    assert cost_per_availability_point(cost, 0.0) is None


def test_incremental_cost_per_pp_positive_gain() -> None:
    assumptions = CostAssumptions(satellite_unit_cost_rub=1_000_000)
    before = estimate_cost(44, assumptions)
    after = estimate_cost(45, assumptions)
    assert before is not None and after is not None
    result = incremental_cost_per_pp(before, 89.72, after, 91.53)
    assert result == pytest.approx((after.estimated_total_rub - before.estimated_total_rub) / (91.53 - 89.72))


def test_incremental_cost_per_pp_none_when_no_gain() -> None:
    assumptions = CostAssumptions(satellite_unit_cost_rub=1_000_000)
    before = estimate_cost(44, assumptions)
    after = estimate_cost(45, assumptions)
    assert before is not None and after is not None
    assert incremental_cost_per_pp(before, 90.0, after, 90.0) is None
    assert incremental_cost_per_pp(before, 90.0, after, 89.0) is None


def test_estimated_cost_delta_is_signed() -> None:
    assumptions = CostAssumptions(satellite_unit_cost_rub=1_000_000)
    a = estimate_cost(44, assumptions)
    b = estimate_cost(45, assumptions)
    assert a is not None and b is not None
    assert estimated_cost_delta(a, b) == pytest.approx(1_000_000)
    assert estimated_cost_delta(b, a) == pytest.approx(-1_000_000)
