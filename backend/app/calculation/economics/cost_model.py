"""Cost/resource layer for deployment decisions.

Two modes, both always available:

- **Resource-only** (the default, and the only mode when no cost
  assumption is supplied) — satellite count, launch batches, satellites
  added per stage. No currency anywhere. This is the honest baseline: the
  case gives no verified 2026 unit prices, so a resource count is the only
  thing that is not a guess.
- **Cost mode** (opt-in) — the caller supplies `CostAssumptions`
  explicitly (unit satellite cost, launch fixed cost, launch capacity,
  optional integration cost/reserve). Every number this module produces
  from them is a plain, inspectable arithmetic combination of exactly
  those inputs — no hidden coefficients, no inflation adjustment, no
  "market rate" invented anywhere. If `satellite_unit_cost_rub` is not
  given, cost estimation returns `None`, not a guessed number.

Historical public reference points (e.g. the 2021 Sitronics/SPUTNIX
estimate) belong in the frontend as a labelled, optional starting point
for `CostAssumptions` the user can accept or overwrite — never applied
silently. See docs/cost-sources.md for the sourced figures themselves;
this module never embeds a number from that document as a default.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class CostAssumptions:
    """All fields are the caller's explicit input — nothing here is a
    built-in default price. `satellite_unit_cost_rub is None` means
    "cost mode is off"."""

    satellite_unit_cost_rub: float | None = None
    launch_fixed_cost_rub: float | None = None
    launch_capacity_satellites: int | None = None
    integration_cost_rub: float = 0.0
    reserve_percent: float = 0.0
    source_label: str | None = None


@dataclass(frozen=True)
class ResourceSummary:
    satellite_count: int
    total_satellites: int
    launch_batches_used: int
    estimated_launches: int | None


@dataclass(frozen=True)
class CostEstimate:
    satellite_count: int
    estimated_satellite_cost_rub: float
    estimated_launches: int | None
    estimated_launch_cost_rub: float
    integration_cost_rub: float
    reserve_percent: float
    estimated_total_rub: float
    source_label: str | None


def resource_summary(
    satellite_count: int,
    total_satellites: int,
    *,
    launch_batches_used: int,
    launch_capacity_satellites: int | None = None,
) -> ResourceSummary:
    """The always-available, currency-free view."""
    estimated_launches = (
        math.ceil(satellite_count / launch_capacity_satellites)
        if launch_capacity_satellites
        else None
    )
    return ResourceSummary(
        satellite_count=satellite_count,
        total_satellites=total_satellites,
        launch_batches_used=launch_batches_used,
        estimated_launches=estimated_launches,
    )


def estimate_cost(satellite_count: int, assumptions: CostAssumptions) -> CostEstimate | None:
    """`None` when `satellite_unit_cost_rub` is not supplied — the caller
    must fall back to `resource_summary`, never to a guessed price."""
    if assumptions.satellite_unit_cost_rub is None:
        return None

    satellite_cost = satellite_count * assumptions.satellite_unit_cost_rub

    estimated_launches: int | None = None
    launch_cost = 0.0
    if assumptions.launch_fixed_cost_rub is not None and assumptions.launch_capacity_satellites:
        estimated_launches = math.ceil(
            satellite_count / assumptions.launch_capacity_satellites
        )
        launch_cost = estimated_launches * assumptions.launch_fixed_cost_rub

    subtotal = satellite_cost + launch_cost + assumptions.integration_cost_rub
    reserve_multiplier = 1.0 + assumptions.reserve_percent / 100.0
    total = subtotal * reserve_multiplier

    return CostEstimate(
        satellite_count=satellite_count,
        estimated_satellite_cost_rub=satellite_cost,
        estimated_launches=estimated_launches,
        estimated_launch_cost_rub=launch_cost,
        integration_cost_rub=assumptions.integration_cost_rub,
        reserve_percent=assumptions.reserve_percent,
        estimated_total_rub=total,
        source_label=assumptions.source_label,
    )


def cost_per_availability_point(cost: CostEstimate, worst_availability_percent: float) -> float | None:
    """Total cost divided by the worst-client availability percentage
    reached — a plain efficiency ratio, not a composite score. `None` if
    availability is 0 (division would be meaningless)."""
    if worst_availability_percent <= 0:
        return None
    return cost.estimated_total_rub / worst_availability_percent


def incremental_cost_per_pp(
    cost_before: CostEstimate,
    availability_before_percent: float,
    cost_after: CostEstimate,
    availability_after_percent: float,
) -> float | None:
    """Cost of the marginal availability gained going from one candidate
    to a "better" one — `None` if availability did not actually improve
    (division by ~0 or a availability decrease would be a nonsense ratio,
    not a cost)."""
    delta_availability_pp = availability_after_percent - availability_before_percent
    if delta_availability_pp <= 0:
        return None
    delta_cost = cost_after.estimated_total_rub - cost_before.estimated_total_rub
    return delta_cost / delta_availability_pp


def estimated_cost_delta(cost_a: CostEstimate, cost_b: CostEstimate) -> float:
    """`cost_b - cost_a`, signed — positive means B costs more."""
    return cost_b.estimated_total_rub - cost_a.estimated_total_rub
