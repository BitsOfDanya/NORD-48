"""Outage-duration distribution — a detail view alongside `max_outage_s`.

`max_outage_s` (in `ClientMetrics`) stays the headline KPI because the
case explicitly asks for it. This module answers a narrower, additional
question: not just the single worst outage, but the full distribution of
outage event durations (count, total, mean, median, P95) — useful to tell
apart "one long outage" from "many short ones" at the same max_outage_s.

Pure function, additive: does not touch `compute_client_metrics` or its
output shape, so nothing that already depends on `ClientMetrics` changes.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import fmean, median

import numpy as np


@dataclass
class OutageDurationStats:
    event_count: int
    total_outage_s: int
    mean_outage_s: float
    median_outage_s: float
    p95_outage_s: float
    max_outage_s: int


def outage_durations_s(available_flags: list[bool], step_s: int) -> list[int]:
    """Duration (seconds) of each consecutive run of `False` in `available_flags`."""
    durations: list[int] = []
    current_run = 0
    for available in available_flags:
        if available:
            if current_run > 0:
                durations.append(current_run * step_s)
            current_run = 0
        else:
            current_run += 1
    if current_run > 0:
        durations.append(current_run * step_s)
    return durations


def compute_outage_quality(available_flags: list[bool], step_s: int) -> OutageDurationStats:
    durations = outage_durations_s(available_flags, step_s)
    if not durations:
        return OutageDurationStats(
            event_count=0,
            total_outage_s=0,
            mean_outage_s=0.0,
            median_outage_s=0.0,
            p95_outage_s=0.0,
            max_outage_s=0,
        )
    return OutageDurationStats(
        event_count=len(durations),
        total_outage_s=sum(durations),
        mean_outage_s=fmean(durations),
        median_outage_s=float(median(durations)),
        p95_outage_s=float(np.percentile(np.asarray(durations, dtype=float), 95)),
        max_outage_s=max(durations),
    )
