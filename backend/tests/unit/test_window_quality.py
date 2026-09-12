from __future__ import annotations

from app.calculation.metrics.window_quality import compute_window_quality, window_durations_s


def test_window_durations_finds_runs_of_true() -> None:
    # True runs: [T,T] (2 steps), [T,T,T] (3 steps) -> 240s, 360s at step=120
    flags = [True, True, False, True, True, True, False]
    assert window_durations_s(flags, 120) == [240, 360]


def test_window_durations_empty_when_never_true() -> None:
    assert window_durations_s([False, False, False], 120) == []


def test_window_durations_single_run_covering_whole_horizon() -> None:
    assert window_durations_s([True, True, True], 60) == [180]


def test_window_durations_trailing_run_is_counted() -> None:
    flags = [False, True, True]
    assert window_durations_s(flags, 100) == [200]


def test_compute_window_quality_empty_flags_returns_zeroed_stats() -> None:
    stats = compute_window_quality([False, False], 120)
    assert stats.window_count == 0
    assert stats.total_window_s == 0
    assert stats.longest_window_s == 0


def test_compute_window_quality_matches_expected_distribution() -> None:
    # Windows of 1, 2, 3 steps at step_s=100 -> durations 100, 200, 300
    flags = [True, False, True, True, False, True, True, True]
    stats = compute_window_quality(flags, 100)

    assert stats.window_count == 3
    assert stats.total_window_s == 600
    assert stats.mean_window_s == 200.0
    assert stats.median_window_s == 200.0
    assert stats.longest_window_s == 300


def test_compute_window_quality_is_the_complement_of_outage_quality() -> None:
    """A service window is by construction the complement of an outage —
    total_window_s + total_outage_s must equal the full flag-count horizon."""
    from app.calculation.metrics.outage_quality import compute_outage_quality

    flags = [True, True, False, False, True, False, True, True, True, False]
    step_s = 120
    window_stats = compute_window_quality(flags, step_s)
    outage_stats = compute_outage_quality(flags, step_s)

    assert window_stats.total_window_s + outage_stats.total_outage_s == len(flags) * step_s
