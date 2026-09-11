"""Unit tests for scenario schema + reference validation layering."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.calculation.geometry import adapter as geometry_adapter
from app.core.exceptions import InvalidScenarioError
from app.schemas.scenario import ScenarioSchema
from app.services import scenario_service

EXAMPLE = Path(__file__).resolve().parents[3] / "data/scenarios/raw/01_full_constellation.json"


def _load_raw() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def test_valid_scenario_parses() -> None:
    raw = _load_raw()
    parsed = ScenarioSchema.model_validate(raw)
    assert parsed.schema_version == "cosmo-A-1.0"
    assert len(parsed.design.satellites) == 48
    assert len(parsed.design.planes) == 3


def test_round_trip_preserves_fields() -> None:
    raw = _load_raw()
    parsed = ScenarioSchema.model_validate(raw)
    dumped = parsed.to_dict()

    assert dumped["schema_version"] == raw["schema_version"]
    assert dumped["design"]["launch_stage"] == raw["design"]["launch_stage"]
    assert len(dumped["design"]["satellites"]) == len(raw["design"]["satellites"])
    assert dumped["ground_sites"] == raw["ground_sites"]


def test_round_trip_preserves_unknown_fields() -> None:
    raw = _load_raw()
    raw["custom_note"] = "kept-through-round-trip"
    raw["environment"]["custom_env_field"] = 42

    parsed = ScenarioSchema.model_validate(raw)
    dumped = parsed.to_dict()

    assert dumped["custom_note"] == "kept-through-round-trip"
    assert dumped["environment"]["custom_env_field"] == 42


def test_missing_required_field_rejected() -> None:
    raw = _load_raw()
    del raw["environment"]

    with pytest.raises(ValidationError):
        ScenarioSchema.model_validate(raw)


def test_reference_validation_still_applies_after_schema_parse() -> None:
    """Pydantic alone won't catch an out-of-range angle; geometry.validate() must."""
    raw = _load_raw()
    raw["design"]["planes"][0]["raan_deg"] = 999.0  # structurally fine, physically invalid

    parsed = ScenarioSchema.model_validate(raw)  # passes schema layer
    with pytest.raises(InvalidScenarioError):
        geometry_adapter.validate_scenario(parsed.to_dict())  # fails reference layer


def test_scenario_service_rejects_invalid_scenario_with_clear_message() -> None:
    raw = _load_raw()
    raw["schema_version"] = "not-a-real-schema"

    with pytest.raises(InvalidScenarioError):
        scenario_service.parse_and_validate(raw)


def test_scenario_service_rejects_malformed_json_bytes() -> None:
    with pytest.raises(InvalidScenarioError):
        scenario_service.load_uploaded_scenario(b"{not valid json")


def test_list_examples_returns_all_four() -> None:
    examples = scenario_service.list_examples()
    ids = {e["id"] for e in examples}
    assert ids == {
        "01_full_constellation",
        "02_first_launch",
        "03_satellite_outages",
        "04_link_range",
    }
