from __future__ import annotations

import pytest

from app.calculation.metrics.bottleneck_decomposition import (
    AVAILABLE_LABEL,
    compute_bottleneck_breakdown,
)


def test_all_available_gives_one_hundred_percent_available() -> None:
    breakdown = compute_bottleneck_breakdown([None, None, None, None])
    assert breakdown.percentages == {AVAILABLE_LABEL: 100.0}
    assert breakdown.counts == {AVAILABLE_LABEL: 4}
    assert breakdown.total_steps == 4


def test_mixed_reasons_sum_to_one_hundred_percent() -> None:
    reasons = [
        None, None,
        "NO_VISIBLE_SATELLITE",
        "ISL_NETWORK_SPLIT", "ISL_NETWORK_SPLIT",
        "NO_GATEWAY_CONTACT",
    ]
    breakdown = compute_bottleneck_breakdown(reasons)

    assert breakdown.total_steps == 6
    assert breakdown.counts == {
        AVAILABLE_LABEL: 2,
        "NO_VISIBLE_SATELLITE": 1,
        "ISL_NETWORK_SPLIT": 2,
        "NO_GATEWAY_CONTACT": 1,
    }
    assert sum(breakdown.percentages.values()) == pytest.approx(100.0)
    assert breakdown.percentages["ISL_NETWORK_SPLIT"] == pytest.approx(100.0 / 3.0)


def test_empty_input_returns_zeroed_breakdown_without_dividing_by_zero() -> None:
    breakdown = compute_bottleneck_breakdown([])
    assert breakdown.total_steps == 0
    assert breakdown.counts == {}
    assert breakdown.percentages == {}


def test_categories_are_mutually_exclusive_never_double_counted() -> None:
    # Every step contributes to exactly one bucket regardless of order/mix.
    reasons = ["GATEWAY_OUTAGE"] * 3 + [None] * 7
    breakdown = compute_bottleneck_breakdown(reasons)
    assert sum(breakdown.counts.values()) == len(reasons)
