"""Physical/orbital metrics derived from the same constants and spherical-
Earth approximation as `reference_geometry.py` (imported, not redefined,
so this module can never silently drift from the official physics). Pure
arithmetic — no simulation, no dependency on any scenario file.

Deliberately NOT included here (see docs/physical-model.md): RF link
budget (SNR, Eb/N0, capacity) — the case provides no frequency, EIRP,
antenna gain, or noise-figure inputs, so any such number would be
fabricated, not computed.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.calculation.geometry import reference_geometry as geometry

SPEED_OF_LIGHT_KM_S = 299_792.458


def orbital_period_s(altitude_km: float) -> float:
    """Kepler's third law for a circular orbit: T = 2*pi*sqrt(a^3 / mu)."""
    semi_major_axis_km = geometry.R + altitude_km
    return 2.0 * math.pi * math.sqrt(semi_major_axis_km**3 / geometry.MU)


def revolutions_per_day(altitude_km: float) -> float:
    return 86_400.0 / orbital_period_s(altitude_km)


@dataclass(frozen=True)
class CoverageFootprint:
    half_angle_deg: float
    """Geocentric half-angle (Earth-centre to sub-satellite-point-to-edge-
    of-coverage angle) at which a ground point on the horizon sees the
    satellite at exactly `min_elevation_deg`."""
    ground_radius_km: float
    """Great-circle (arc) radius of the coverage circle on the ground."""
    area_km2: float
    """Spherical-cap area of the coverage circle."""


def coverage_footprint(altitude_km: float, min_elevation_deg: float) -> CoverageFootprint:
    """Spherical-Earth coverage geometry for one satellite.

    psi = acos( (R / (R+h)) * cos(e_min) ) - e_min

    `psi` is the Earth-central angle from the sub-satellite point to the
    edge of the coverage circle where elevation drops to `min_elevation_deg`.
    Assumption: spherical Earth, no terrain/atmosphere refraction — the
    same simplification the reference elevation model itself relies on.
    """
    r_earth = geometry.R
    r_orbit = r_earth + altitude_km
    e_min_rad = math.radians(min_elevation_deg)
    psi_rad = math.acos((r_earth / r_orbit) * math.cos(e_min_rad)) - e_min_rad
    psi_rad = max(0.0, psi_rad)
    ground_radius_km = r_earth * psi_rad
    area_km2 = 2.0 * math.pi * r_earth**2 * (1.0 - math.cos(psi_rad))
    return CoverageFootprint(
        half_angle_deg=math.degrees(psi_rad),
        ground_radius_km=ground_radius_km,
        area_km2=area_km2,
    )


def propagation_delay_s(distance_km: float) -> float:
    """One-way GEOMETRIC propagation delay only — no processing, queuing,
    or switching latency is modeled anywhere in this project."""
    return distance_km / SPEED_OF_LIGHT_KM_S
