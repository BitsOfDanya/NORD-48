from __future__ import annotations

import math

import pytest

from app.calculation.geometry import reference_geometry as geometry
from app.calculation.physics.orbital_metrics import (
    SPEED_OF_LIGHT_KM_S,
    coverage_footprint,
    orbital_period_s,
    propagation_delay_s,
    revolutions_per_day,
)


def test_orbital_period_matches_kepler_third_law_directly() -> None:
    altitude_km = 550.0
    a = geometry.R + altitude_km
    expected = 2.0 * math.pi * math.sqrt(a**3 / geometry.MU)

    assert orbital_period_s(altitude_km) == pytest.approx(expected)


def test_orbital_period_for_reference_550km_is_physically_reasonable() -> None:
    # A 550 km LEO orbit takes roughly 95-96 minutes — a well-known figure
    # (close to the ISS's ~92 min at a slightly lower altitude).
    period_s = orbital_period_s(550.0)
    period_min = period_s / 60.0

    assert 90.0 < period_min < 100.0


def test_orbital_period_increases_with_altitude() -> None:
    assert orbital_period_s(600.0) > orbital_period_s(550.0) > orbital_period_s(500.0)


def test_revolutions_per_day_is_inverse_of_period() -> None:
    altitude_km = 550.0
    assert revolutions_per_day(altitude_km) == pytest.approx(86_400.0 / orbital_period_s(altitude_km))


def test_revolutions_per_day_for_550km_is_around_fifteen() -> None:
    # ~15-16 orbits/day is the standard LEO figure at this altitude band.
    assert 14.5 < revolutions_per_day(550.0) < 16.0


def test_coverage_footprint_zero_at_min_elevation_ninety_degrees() -> None:
    # Looking straight up (90 deg) covers nothing but the sub-satellite point.
    footprint = coverage_footprint(550.0, 90.0)

    assert footprint.half_angle_deg == pytest.approx(0.0, abs=1e-9)
    assert footprint.ground_radius_km == pytest.approx(0.0, abs=1e-6)
    assert footprint.area_km2 == pytest.approx(0.0, abs=1e-3)


def test_coverage_footprint_grows_as_min_elevation_drops() -> None:
    strict = coverage_footprint(550.0, 30.0)
    lenient = coverage_footprint(550.0, 5.0)

    assert lenient.half_angle_deg > strict.half_angle_deg
    assert lenient.ground_radius_km > strict.ground_radius_km
    assert lenient.area_km2 > strict.area_km2


def test_coverage_footprint_reference_10deg_550km_is_physically_reasonable() -> None:
    # At 550 km / 10 deg min elevation the coverage half-angle should be a
    # modest fraction of the Earth's radius worth of arc, not near-global
    # and not vanishingly small.
    footprint = coverage_footprint(550.0, 10.0)

    assert 10.0 < footprint.half_angle_deg < 25.0
    assert 1_000.0 < footprint.ground_radius_km < 3_000.0


def test_coverage_footprint_never_negative_at_extreme_elevation() -> None:
    # Guards the max(0.0, ...) clamp for elevation masks so strict that the
    # raw acos - e_min could go slightly negative from floating point.
    footprint = coverage_footprint(550.0, 89.999999)

    assert footprint.half_angle_deg >= 0.0
    assert footprint.ground_radius_km >= 0.0


def test_propagation_delay_matches_distance_over_speed_of_light() -> None:
    distance_km = 3000.0
    assert propagation_delay_s(distance_km) == pytest.approx(distance_km / SPEED_OF_LIGHT_KM_S)


def test_propagation_delay_for_isl_range_is_millisecond_scale() -> None:
    # 3000 km / c is about 10 ms - sanity check against a known order of magnitude.
    delay_s = propagation_delay_s(3000.0)
    assert 0.009 < delay_s < 0.011


def test_propagation_delay_zero_at_zero_distance() -> None:
    assert propagation_delay_s(0.0) == 0.0
