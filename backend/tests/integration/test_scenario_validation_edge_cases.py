"""Hidden-test-style audit of every invalid-scenario edge case section 18
of the case hardening pass calls out. All of these are already enforced
by the OFFICIAL `reference_geometry.validate()` (not touched here) — this
file only proves each one surfaces as a clean 422 with a readable
`detail`, never a raw stack trace, through the real upload endpoint.
"""

from __future__ import annotations

import copy
import io
import json
import math
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _valid_scenario() -> dict[str, Any]:
    return {
        "schema_version": "cosmo-A-1.0",
        "meta": {"id": "edge_case_base", "title": "Edge case base"},
        "environment": {
            "altitude_km": 550.0,
            "inclination_deg": 87.0,
            "earth_angle0_deg": 0.0,
            "horizon_s": 240,
            "step_s": 120,
            "min_elevation_deg": 10.0,
            "isl_range_km": 3000.0,
            "target_availability": 0.9,
        },
        "design": {
            "launch_stage": 1,
            "planes": [{"id": "P1", "raan_deg": 0.0, "phase_deg": 0.0}],
            "satellites": [
                {"id": "S1", "plane_id": "P1", "slot_deg": 0.0, "launch_batch": 1},
                {"id": "S2", "plane_id": "P1", "slot_deg": 180.0, "launch_batch": 1},
            ],
        },
        "ground_sites": [
            {"id": "CLIENT_X", "name": "x", "role": "client", "lat_deg": 0.0, "lon_deg": 0.0},
            {"id": "GATEWAY_X", "name": "x", "role": "gateway", "lat_deg": 0.0, "lon_deg": 10.0},
        ],
        "failures": [],
        "gateway_outages": [],
    }


def _upload(scenario: dict[str, Any]) -> Any:
    body = json.dumps(scenario).encode("utf-8")
    return client.post(
        "/api/v1/scenarios/upload",
        files={"file": ("scenario.json", io.BytesIO(body), "application/json")},
    )


def test_valid_base_scenario_is_accepted() -> None:
    """Sanity check the fixture itself is valid before every mutation test
    below relies on it being the ONLY broken thing in the payload."""
    response = _upload(_valid_scenario())
    assert response.status_code == 200


def _mutate_duplicate_satellite_id(s: dict) -> dict:
    s["design"]["satellites"][1]["id"] = s["design"]["satellites"][0]["id"]
    return s


def _mutate_duplicate_ground_id(s: dict) -> dict:
    s["ground_sites"][1]["id"] = s["ground_sites"][0]["id"]
    return s


def _mutate_ground_id_conflicts_satellite_id(s: dict) -> dict:
    s["ground_sites"][0]["id"] = s["design"]["satellites"][0]["id"]
    return s


def _mutate_unknown_plane_id(s: dict) -> dict:
    s["design"]["satellites"][0]["plane_id"] = "NOT_A_PLANE"
    return s


def _mutate_unknown_failure_satellite(s: dict) -> dict:
    s["failures"] = [{"satellite_id": "GHOST_SAT", "start_s": 0, "end_s": 100}]
    return s


def _mutate_unknown_gateway_outage_id(s: dict) -> dict:
    s["gateway_outages"] = [{"gateway_id": "GHOST_GATEWAY", "start_s": 0, "end_s": 100}]
    return s


def _mutate_invalid_lat_too_high(s: dict) -> dict:
    s["ground_sites"][0]["lat_deg"] = 91.0
    return s


def _mutate_invalid_lon_too_high(s: dict) -> dict:
    s["ground_sites"][0]["lon_deg"] = 181.0
    return s


def _mutate_invalid_raan(s: dict) -> dict:
    s["design"]["planes"][0]["raan_deg"] = 360.0  # valid range is [0, 360)
    return s


def _mutate_invalid_phase(s: dict) -> dict:
    s["design"]["planes"][0]["phase_deg"] = -1.0
    return s


def _mutate_nan_altitude(s: dict) -> dict:
    s["environment"]["altitude_km"] = math.nan
    return s


def _mutate_infinite_isl_range(s: dict) -> dict:
    s["environment"]["isl_range_km"] = math.inf
    return s


def _mutate_step_zero(s: dict) -> dict:
    s["environment"]["step_s"] = 0
    return s


def _mutate_horizon_zero(s: dict) -> dict:
    s["environment"]["horizon_s"] = 0
    s["environment"]["step_s"] = 0
    return s


def _mutate_horizon_not_divisible_by_step(s: dict) -> dict:
    s["environment"]["horizon_s"] = 250  # not a multiple of step_s=120
    return s


def _mutate_failure_outside_horizon(s: dict) -> dict:
    s["failures"] = [{"satellite_id": "S1", "start_s": 0, "end_s": 10_000}]  # > horizon_s=240
    return s


def _mutate_failure_start_after_end(s: dict) -> dict:
    s["failures"] = [{"satellite_id": "S1", "start_s": 200, "end_s": 100}]
    return s


def _mutate_failure_start_equals_end(s: dict) -> dict:
    s["failures"] = [{"satellite_id": "S1", "start_s": 100, "end_s": 100}]
    return s


def _mutate_no_client_role(s: dict) -> dict:
    s["ground_sites"][0]["role"] = "gateway"
    return s


def _mutate_no_gateway_role(s: dict) -> dict:
    s["ground_sites"][1]["role"] = "client"
    return s


def _mutate_duplicate_plane_id(s: dict) -> dict:
    s["design"]["planes"].append({"id": "P1", "raan_deg": 90.0, "phase_deg": 90.0})
    return s


def _mutate_empty_satellites(s: dict) -> dict:
    s["design"]["satellites"] = []
    return s


CASES: list[tuple[str, Callable[[dict], dict]]] = [
    ("duplicate_satellite_id", _mutate_duplicate_satellite_id),
    ("duplicate_ground_id", _mutate_duplicate_ground_id),
    ("ground_id_conflicts_satellite_id", _mutate_ground_id_conflicts_satellite_id),
    ("unknown_plane_id", _mutate_unknown_plane_id),
    ("unknown_failure_satellite", _mutate_unknown_failure_satellite),
    ("unknown_gateway_outage_id", _mutate_unknown_gateway_outage_id),
    ("invalid_lat_too_high", _mutate_invalid_lat_too_high),
    ("invalid_lon_too_high", _mutate_invalid_lon_too_high),
    ("invalid_raan_at_360", _mutate_invalid_raan),
    ("invalid_phase_negative", _mutate_invalid_phase),
    ("nan_altitude", _mutate_nan_altitude),
    ("infinite_isl_range", _mutate_infinite_isl_range),
    ("step_zero", _mutate_step_zero),
    ("horizon_zero", _mutate_horizon_zero),
    ("horizon_not_divisible_by_step", _mutate_horizon_not_divisible_by_step),
    ("failure_outside_horizon", _mutate_failure_outside_horizon),
    ("failure_start_after_end", _mutate_failure_start_after_end),
    ("failure_start_equals_end", _mutate_failure_start_equals_end),
    ("no_client_role", _mutate_no_client_role),
    ("no_gateway_role", _mutate_no_gateway_role),
    ("duplicate_plane_id", _mutate_duplicate_plane_id),
    ("empty_satellites", _mutate_empty_satellites),
]


def test_every_invalid_scenario_edge_case_returns_clean_422() -> None:
    for name, mutate in CASES:
        scenario = mutate(copy.deepcopy(_valid_scenario()))
        response = _upload(scenario)

        assert response.status_code == 422, f"{name}: expected 422, got {response.status_code}"
        body = response.json()
        assert "detail" in body, f"{name}: missing 'detail' in error body"
        assert isinstance(body["detail"], str), f"{name}: detail is not a plain string"
        assert "Traceback" not in body["detail"], f"{name}: leaked a stack trace"
