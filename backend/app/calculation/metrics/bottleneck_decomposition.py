"""Aggregate the per-step `diagnostic_reason` (see
`app.calculation.diagnostics.diagnostics`) a client's route already
carries across a full horizon into one mutually-exclusive percentage
breakdown — "67.78% is not just a bad number, most of the loss is
structural ISL split" instead of a single aggregate availability figure.

Not a new calculation: every step's reason is already computed by the
main simulation pass (`RouteRecord.diagnostic_reason`); this module only
counts what is already there. Categories are mutually exclusive by
construction (`diagnose()` assigns exactly one reason, or `None` when a
route exists), so percentages always sum to 100%.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

AVAILABLE_LABEL = "ROUTE_AVAILABLE"


@dataclass
class BottleneckBreakdown:
    total_steps: int
    counts: dict[str, int]
    percentages: dict[str, float]


def compute_bottleneck_breakdown(diagnostic_reasons: list[str | None]) -> BottleneckBreakdown:
    """`diagnostic_reasons[i]` is `None` for a step with an available route,
    or the mutually-exclusive reason string for a step without one."""
    total = len(diagnostic_reasons)
    labeled = [reason if reason is not None else AVAILABLE_LABEL for reason in diagnostic_reasons]
    counts = dict(Counter(labeled))
    scale = 100.0 / total if total else 0.0
    percentages = {label: count * scale for label, count in counts.items()}
    return BottleneckBreakdown(total_steps=total, counts=counts, percentages=percentages)
