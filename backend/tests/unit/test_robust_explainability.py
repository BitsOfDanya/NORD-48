from __future__ import annotations

from app.calculation.optimization.robust_explainability import (
    compute_recovery_stats,
    dominant_recovery_reason,
    find_transition_example,
    recovery_summary,
)
from app.models.route import RouteRecord


def _record(t_s: int, available: bool, reason: str | None = None) -> RouteRecord:
    return RouteRecord(
        t_s=t_s,
        client_id="C1",
        gateway_id="G1" if available else None,
        strategy="minimum_hops",
        path=["C1", "S1", "G1"] if available else [],
        diagnostic_reason=None if available else reason,
    )


def test_recovered_and_lost_steps_are_symmetric_and_independent() -> None:
    # step0: baseline down (ISL split), candidate up -> recovered
    # step1: both up -> neither
    # step2: baseline up, candidate down (no visible satellite) -> lost
    # step3: both down (same reason) -> neither
    baseline = {
        "C1": [
            _record(0, False, "ISL_NETWORK_SPLIT"),
            _record(60, True),
            _record(120, True),
            _record(180, False, "NO_GATEWAY_CONTACT"),
        ]
    }
    candidate = {
        "C1": [
            _record(0, True),
            _record(60, True),
            _record(120, False, "NO_VISIBLE_SATELLITE"),
            _record(180, False, "NO_GATEWAY_CONTACT"),
        ]
    }

    stats = compute_recovery_stats(baseline, candidate, step_s=60)
    c1 = stats["C1"]

    assert c1.recovered_steps == 1
    assert c1.lost_steps == 1
    assert c1.net_recovered_steps == 0
    assert c1.recovered_seconds == 60
    assert c1.lost_seconds == 60
    assert c1.net_recovered_seconds == 0
    assert c1.recovered_reason_counts == {"ISL_NETWORK_SPLIT": 1}
    assert c1.lost_reason_counts == {"NO_VISIBLE_SATELLITE": 1}


def test_dominant_recovery_reason_across_clients() -> None:
    baseline = {
        "C1": [_record(0, False, "ISL_NETWORK_SPLIT"), _record(60, False, "ISL_NETWORK_SPLIT")],
        "C2": [_record(0, False, "NO_GATEWAY_CONTACT"), _record(60, False, "ISL_NETWORK_SPLIT")],
    }
    candidate = {
        "C1": [_record(0, True), _record(60, True)],
        "C2": [_record(0, True), _record(60, True)],
    }
    stats = compute_recovery_stats(baseline, candidate, step_s=120)
    assert dominant_recovery_reason(stats) == "ISL_NETWORK_SPLIT"


def test_dominant_recovery_reason_is_none_when_nothing_recovered() -> None:
    baseline = {"C1": [_record(0, True)]}
    candidate = {"C1": [_record(0, True)]}
    stats = compute_recovery_stats(baseline, candidate, step_s=120)
    assert dominant_recovery_reason(stats) is None


def test_find_transition_example_recovered_reports_baseline_reason_and_candidate_path() -> None:
    baseline = {"C1": [_record(0, True), _record(60, False, "ISL_NETWORK_SPLIT")]}
    candidate = {"C1": [_record(0, True), _record(60, True)]}

    example = find_transition_example(baseline, candidate, recovered=True)

    assert example == {
        "client_id": "C1",
        "t_s": 60,
        "baseline_reason": "ISL_NETWORK_SPLIT",
        "candidate_path": ["C1", "S1", "G1"],
        "candidate_edges": [("C1", "S1"), ("S1", "G1")],
    }


def test_find_transition_example_lost_reports_candidate_reason_and_baseline_path() -> None:
    baseline = {"C1": [_record(0, True)]}
    candidate = {"C1": [_record(0, False, "NO_VISIBLE_SATELLITE")]}

    example = find_transition_example(baseline, candidate, recovered=False)

    assert example == {
        "client_id": "C1",
        "t_s": 0,
        "candidate_reason": "NO_VISIBLE_SATELLITE",
        "baseline_path": ["C1", "S1", "G1"],
        "baseline_edges": [("C1", "S1"), ("S1", "G1")],
    }


def test_find_transition_example_returns_none_when_no_transition_matches() -> None:
    baseline = {"C1": [_record(0, True)]}
    candidate = {"C1": [_record(0, True)]}
    assert find_transition_example(baseline, candidate, recovered=True) is None
    assert find_transition_example(baseline, candidate, recovered=False) is None


def test_recovery_summary_aggregates_across_clients() -> None:
    baseline = {
        "C1": [_record(0, False, "ISL_NETWORK_SPLIT")],
        "C2": [_record(0, True)],
    }
    candidate = {
        "C1": [_record(0, True)],
        "C2": [_record(0, False, "NO_GATEWAY_CONTACT")],
    }
    stats = compute_recovery_stats(baseline, candidate, step_s=100)
    summary = recovery_summary(stats)
    assert summary == {
        "total_recovered_seconds": 100,
        "total_lost_seconds": 100,
        "total_net_recovered_seconds": 0,
    }
