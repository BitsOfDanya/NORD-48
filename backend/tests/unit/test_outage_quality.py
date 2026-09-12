from __future__ import annotations

from app.calculation.metrics.outage_quality import compute_outage_quality, outage_durations_s


def test_outage_durations_no_outages() -> None:
    assert outage_durations_s([True, True, True], 120) == []


def test_outage_durations_single_run() -> None:
    assert outage_durations_s([True, False, False, True], 120) == [240]


def test_outage_durations_multiple_runs() -> None:
    assert outage_durations_s([False, True, False, False, False, True], 60) == [60, 180]


def test_outage_durations_trailing_run_counted() -> None:
    assert outage_durations_s([True, False], 100) == [100]


def test_compute_outage_quality_empty_is_zeroed() -> None:
    stats = compute_outage_quality([True, True], 120)
    assert stats.event_count == 0
    assert stats.total_outage_s == 0
    assert stats.max_outage_s == 0
    assert stats.mean_outage_s == 0.0


def test_compute_outage_quality_matches_max_outage_definition() -> None:
    # Same rule as ClientMetrics.max_outage_s: longest run * step_s.
    flags = [True] + [False] * 5 + [True] + [False] * 2 + [True]
    stats = compute_outage_quality(flags, 120)
    assert stats.max_outage_s == 600
    assert stats.event_count == 2
    assert stats.total_outage_s == 600 + 240
    assert stats.mean_outage_s == (600 + 240) / 2
    assert stats.median_outage_s == (600 + 240) / 2


def test_compute_outage_quality_p95_within_bounds() -> None:
    flags = [False, True] * 50
    stats = compute_outage_quality(flags, 10)
    assert stats.event_count == 50
    assert 0 <= stats.p95_outage_s <= stats.max_outage_s
