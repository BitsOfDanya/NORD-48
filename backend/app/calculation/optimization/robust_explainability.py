"""Deterministic, data-driven explanation of why one configuration beats
another under a stress profile — no LLM, no new diagnostic categories.

Reuses `RouteRecord.diagnostic_reason` exactly as already produced by
`app.calculation.diagnostics.diagnose()` for every step: this module only
adds symmetric before/after counting on top of two already-computed
timelines (baseline vs candidate), which no existing function does —
`compare_timelines` (failure_analysis.py) is asymmetric by design (it
only tracks failure-INDUCED outages, baseline available -> now
unavailable), because it exists to grade how bad an injected failure is,
not to credit a candidate for recovering connectivity the baseline never
had. Robust Design Search 2.0 needs the recovering direction too.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from app.models.route import RouteRecord


@dataclass
class ClientRecoveryStats:
    client_id: str
    recovered_steps: int
    lost_steps: int
    net_recovered_steps: int
    recovered_seconds: int
    lost_seconds: int
    net_recovered_seconds: int
    recovered_reason_counts: dict[str, int] = field(default_factory=dict)
    lost_reason_counts: dict[str, int] = field(default_factory=dict)


def compute_recovery_stats(
    baseline_timeline: dict[str, list[RouteRecord]],
    candidate_timeline: dict[str, list[RouteRecord]],
    step_s: int,
) -> dict[str, ClientRecoveryStats]:
    """Per client: steps where the baseline had NO route but the candidate
    does (`recovered`), and the reverse (`lost`). `recovered_reason_counts`
    tallies the BASELINE's `diagnostic_reason` at recovered steps (why it
    failed there); `lost_reason_counts` tallies the CANDIDATE's reason at
    lost steps (why the candidate fails where the baseline didn't) — both
    straight from the existing diagnostic categories, nothing new."""
    stats: dict[str, ClientRecoveryStats] = {}
    for client_id, baseline_records in baseline_timeline.items():
        candidate_records = candidate_timeline[client_id]
        recovered = 0
        lost = 0
        recovered_reasons: Counter[str] = Counter()
        lost_reasons: Counter[str] = Counter()
        for baseline_record, candidate_record in zip(baseline_records, candidate_records, strict=True):
            if not baseline_record.available and candidate_record.available:
                recovered += 1
                if baseline_record.diagnostic_reason:
                    recovered_reasons[baseline_record.diagnostic_reason] += 1
            elif baseline_record.available and not candidate_record.available:
                lost += 1
                if candidate_record.diagnostic_reason:
                    lost_reasons[candidate_record.diagnostic_reason] += 1
        stats[client_id] = ClientRecoveryStats(
            client_id=client_id,
            recovered_steps=recovered,
            lost_steps=lost,
            net_recovered_steps=recovered - lost,
            recovered_seconds=recovered * step_s,
            lost_seconds=lost * step_s,
            net_recovered_seconds=(recovered - lost) * step_s,
            recovered_reason_counts=dict(sorted(recovered_reasons.items())),
            lost_reason_counts=dict(sorted(lost_reasons.items())),
        )
    return stats


def dominant_recovery_reason(stats: dict[str, ClientRecoveryStats]) -> str | None:
    """The single most common diagnostic reason the baseline failed on,
    across all clients, at steps the candidate recovered — `None` if
    nothing was recovered anywhere."""
    total: Counter[str] = Counter()
    for client_stats in stats.values():
        total.update(client_stats.recovered_reason_counts)
    if not total:
        return None
    return total.most_common(1)[0][0]


def recovery_summary(stats: dict[str, ClientRecoveryStats]) -> dict[str, int]:
    return {
        "total_recovered_seconds": sum(s.recovered_seconds for s in stats.values()),
        "total_lost_seconds": sum(s.lost_seconds for s in stats.values()),
        "total_net_recovered_seconds": sum(s.net_recovered_seconds for s in stats.values()),
    }


def find_transition_example(
    baseline_timeline: dict[str, list[RouteRecord]],
    candidate_timeline: dict[str, list[RouteRecord]],
    *,
    recovered: bool,
) -> dict[str, Any] | None:
    """The earliest (client_id, t_s) — client ids sorted, then time order —
    where availability flips in the requested direction. Deterministic, not
    "most interesting": a fixed tie-break beats an arbitrary one. Edges are
    reported as "связь, присутствующая в Robust configuration" territory —
    the caller must not label them 'critical' (that requires min-cut
    analysis, out of scope here)."""
    for client_id in sorted(baseline_timeline):
        baseline_records = baseline_timeline[client_id]
        candidate_records = candidate_timeline.get(client_id)
        if candidate_records is None:
            continue
        for baseline_record, candidate_record in zip(baseline_records, candidate_records, strict=True):
            if recovered and not baseline_record.available and candidate_record.available:
                return {
                    "client_id": client_id,
                    "t_s": baseline_record.t_s,
                    "baseline_reason": baseline_record.diagnostic_reason,
                    "candidate_path": candidate_record.path,
                    "candidate_edges": list(zip(candidate_record.path, candidate_record.path[1:], strict=False)),
                }
            if not recovered and baseline_record.available and not candidate_record.available:
                return {
                    "client_id": client_id,
                    "t_s": baseline_record.t_s,
                    "candidate_reason": candidate_record.diagnostic_reason,
                    "baseline_path": baseline_record.path,
                    "baseline_edges": list(zip(baseline_record.path, baseline_record.path[1:], strict=False)),
                }
    return None
