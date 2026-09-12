"""ISL range sensitivity — "what is the minimum inter-satellite link range
this configuration needs to still reach target availability?"

Exact sweep over a grid of `isl_range_km` values (each point a full
720-step exact simulation — no approximation), optionally refined with a
finer step once the coarse crossing point is known. Reuses the same
pipeline as `evaluate_configuration`, scoped to one scenario instead of a
stress-profile dict, so RAAN/phase/failures of the candidate stay exactly
as given — only `isl_range_km` varies.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from statistics import fmean
from typing import Any

from app.calculation.resilience.failure_analysis import (
    _client_metrics,
    build_graph_timeline,
    compute_timeline,
)


@dataclass
class IslSweepPoint:
    isl_range_km: float
    worst_availability: float
    mean_availability: float
    target_feasible: bool
    clients: dict[str, dict[str, Any]]


def _evaluate_isl(scenario: dict[str, Any], isl_range_km: float, routing_strategy: str) -> IslSweepPoint:
    derived = copy.deepcopy(scenario)
    derived["environment"]["isl_range_km"] = isl_range_km
    graphs = build_graph_timeline(derived)
    timeline = compute_timeline(derived, graphs, routing_strategy)
    clients: dict[str, dict[str, Any]] = {}
    for client_id, records in sorted(timeline.items()):
        metrics = _client_metrics(derived, client_id, records)
        clients[client_id] = {
            "availability_percent": metrics.availability_percent,
            "max_outage_s": metrics.max_outage_s,
            "target_achieved": metrics.target_achieved,
        }
    availability_values = [c["availability_percent"] / 100.0 for c in clients.values()]
    return IslSweepPoint(
        isl_range_km=isl_range_km,
        worst_availability=min(availability_values),
        mean_availability=fmean(availability_values),
        target_feasible=all(c["target_achieved"] for c in clients.values()),
        clients=clients,
    )


def isl_sweep(
    scenario: dict[str, Any],
    isl_values_km: list[float],
    routing_strategy: str,
    *,
    progress: Any = None,
) -> list[IslSweepPoint]:
    """Coarse (or any explicit) grid — sorted ascending, each an exact
    point, no interpolation between them."""
    ordered = sorted(set(isl_values_km))
    points: list[IslSweepPoint] = []
    for isl in ordered:
        point = _evaluate_isl(scenario, isl, routing_strategy)
        points.append(point)
        if progress:
            progress(len(points), len(ordered), point)
    return points


def refine_isl_boundary(
    scenario: dict[str, Any],
    routing_strategy: str,
    low_fail_km: float,
    high_pass_km: float,
    *,
    step_km: float = 50.0,
    progress: Any = None,
) -> list[IslSweepPoint]:
    """Linear refinement between a known-failing and a known-passing point,
    at `step_km` resolution — exact at every tested point, just a finer
    grid than the coarse sweep, not an approximation."""
    if low_fail_km >= high_pass_km:
        raise ValueError("low_fail_km must be less than high_pass_km")
    values = []
    current = low_fail_km + step_km
    while current < high_pass_km:
        values.append(round(current, 3))
        current += step_km
    values.append(high_pass_km)
    return isl_sweep(scenario, values, routing_strategy, progress=progress)


def minimum_isl_for_target(
    points: list[IslSweepPoint], target_availability: float
) -> float | None:
    """Smallest tested ISL range where every client reaches
    `target_availability` — assumes availability is monotone non-decreasing
    in ISL range (physically true: a longer allowed range only adds
    possible contacts, never removes one), so the first passing point in
    ascending order is the minimum among tested values."""
    for point in sorted(points, key=lambda p: p.isl_range_km):
        if point.worst_availability >= target_availability:
            return point.isl_range_km
    return None
