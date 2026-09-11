"""Normalized link-margin calculations.

A margin is how far a contact is from the physical threshold at which it
would disappear, normalized to `[0, 1]` (0 = right at the threshold, 1 =
as comfortable as this model allows). Used by the `maximum_margin` routing
strategy (see `app.calculation.routing.router`) and reported as a
diagnostic for every strategy. Pure arithmetic over values `snapshot`
already computed — no orbital calculation happens here.
"""

from __future__ import annotations


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def isl_margin(distance_km: float, isl_range_km: float) -> float:
    """Margin for an inter-satellite link: how much slack remains before
    `distance_km` reaches the scenario's `isl_range_km` cutoff."""
    if isl_range_km <= 0:
        return 0.0
    return clamp01((isl_range_km - distance_km) / isl_range_km)


def ground_margin(elevation_deg: float, min_elevation_deg: float) -> float:
    """Margin for a ground-to-satellite link: how much slack remains
    before `elevation_deg` drops to the scenario's `min_elevation_deg`
    cutoff, scaled against the full remaining sky up to zenith (90°)."""
    span = 90.0 - min_elevation_deg
    if span <= 0:
        return 0.0
    return clamp01((elevation_deg - min_elevation_deg) / span)
