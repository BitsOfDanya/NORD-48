"""Adapter around the organizers' reference geometry engine.

`reference_geometry.py` (copied unmodified from `case_materials/`) is the
source of truth for all orbital/contact math. This module wraps it behind
a small, stable internal API and translates its errors into
`InvalidScenarioError`. No orbital math is duplicated here.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from app.calculation.geometry import reference_geometry as geometry
from app.core.exceptions import InvalidScenarioError


def load_scenario(path: str | Path) -> dict[str, Any]:
    """Load and reference-validate a scenario JSON file from disk."""
    try:
        return geometry.load(path)
    except (ValueError, KeyError, TypeError) as exc:
        raise InvalidScenarioError(str(exc)) from exc


def validate_scenario(scenario: dict[str, Any]) -> None:
    """Run the organizers' reference validation against a scenario dict."""
    try:
        geometry.validate(scenario)
    except (ValueError, KeyError, TypeError) as exc:
        raise InvalidScenarioError(str(exc)) from exc


def get_snapshot(scenario: dict[str, Any], t_s: float) -> dict[str, Any]:
    """Return the reference geometry snapshot (satellites, edges, elevations) at time t_s."""
    return geometry.snapshot(scenario, t_s)


def ecef_to_geodetic(x_km: float, y_km: float, z_km: float) -> tuple[float, float, float]:
    """Convert Earth-fixed Cartesian km coordinates to lat/lon/altitude.

    Presentation-only helper for the frontend globe view — a spherical-Earth
    conversion consistent with reference_geometry's own spherical model
    (R = 6371 km). Carries no simulation logic of its own.
    """
    lat_deg = math.degrees(math.atan2(z_km, math.hypot(x_km, y_km)))
    lon_deg = math.degrees(math.atan2(y_km, x_km))
    altitude_km = math.sqrt(x_km**2 + y_km**2 + z_km**2) - geometry.R
    return lat_deg, lon_deg, altitude_km
