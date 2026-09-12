"""Contact-window and service-window duration statistics.

Same run-length-encoding idea as `outage_quality.py`, applied to the
OPPOSITE question: not "how long are the gaps", but "how long are the
periods of continuous contact/service" — i.e. `compute_window_quality`
on a flag list is exactly `compute_outage_quality` on the inverted flags,
with clearer naming so a "window" is never confused with an "outage".

- Contact window: continuous period a client has at least one visible
  satellite (`RouteRecord.visible`) — geometric visibility only, does not
  imply a route to the gateway exists.
- Service window: continuous period a client has a full route to the
  gateway (`RouteRecord.available`) — this is what actually matters for
  availability; its complement is exactly what `outage_quality` measures.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import fmean, median

import numpy as np


@dataclass
class WindowStats:
    window_count: int
    total_window_s: int
    mean_window_s: float
    median_window_s: float
    p95_window_s: float
    longest_window_s: int


def window_durations_s(flags: list[bool], step_s: int) -> list[int]:
    """Duration (seconds) of each consecutive run of `True` in `flags`."""
    durations: list[int] = []
    current_run = 0
    for flag in flags:
        if flag:
            current_run += 1
        elif current_run > 0:
            durations.append(current_run * step_s)
            current_run = 0
    if current_run > 0:
        durations.append(current_run * step_s)
    return durations


def compute_window_quality(flags: list[bool], step_s: int) -> WindowStats:
    durations = window_durations_s(flags, step_s)
    if not durations:
        return WindowStats(
            window_count=0,
            total_window_s=0,
            mean_window_s=0.0,
            median_window_s=0.0,
            p95_window_s=0.0,
            longest_window_s=0,
        )
    return WindowStats(
        window_count=len(durations),
        total_window_s=sum(durations),
        mean_window_s=fmean(durations),
        median_window_s=float(median(durations)),
        p95_window_s=float(np.percentile(np.asarray(durations, dtype=float), 95)),
        longest_window_s=max(durations),
    )
