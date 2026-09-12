"""Scenario loading: bundled example scenarios and uploaded scenario files.

Every scenario passes through two validation layers before it can be
simulated: `ScenarioSchema` (structure/types) and then
`geometry_adapter.validate_scenario` (the organizers' reference business
rules). See `app/calculation/geometry/adapter.py`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.calculation.geometry import adapter as geometry_adapter
from app.core.config import get_settings
from app.core.exceptions import InvalidScenarioError, ScenarioNotFoundError
from app.schemas.scenario import ScenarioSchema

_DEFAULT_EXAMPLES_DIR = Path(__file__).resolve().parents[3] / "data" / "scenarios" / "raw"


def _examples_dir() -> Path:
    override = get_settings().scenarios_dir
    return Path(override) if override else _DEFAULT_EXAMPLES_DIR


def _summarize_validation_error(exc: ValidationError) -> str:
    first = exc.errors()[0]
    loc = ".".join(str(part) for part in first["loc"])
    return f"Invalid scenario at '{loc}': {first['msg']}"


def parse_and_validate(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate a raw scenario dict through both the schema and reference layers."""
    try:
        parsed = ScenarioSchema.model_validate(raw)
    except ValidationError as exc:
        raise InvalidScenarioError(_summarize_validation_error(exc)) from exc

    scenario = parsed.to_dict()
    geometry_adapter.validate_scenario(scenario)
    return scenario


def list_examples() -> list[dict[str, Any]]:
    """List bundled example scenarios with a few read-only summary fields."""
    examples = []
    for path in sorted(_examples_dir().glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        meta = raw.get("meta", {})
        env = raw.get("environment", {})
        examples.append(
            {
                "id": meta.get("id", path.stem),
                "title": meta.get("title", path.stem),
                "launch_stage": raw.get("design", {}).get("launch_stage"),
                "altitude_km": env.get("altitude_km"),
                "inclination_deg": env.get("inclination_deg"),
                "isl_range_km": env.get("isl_range_km"),
                "min_elevation_deg": env.get("min_elevation_deg"),
                "target_availability": env.get("target_availability"),
                "horizon_s": env.get("horizon_s"),
                "step_s": env.get("step_s"),
                "failure_count": len(raw.get("failures", [])),
                "gateway_outage_count": len(raw.get("gateway_outages", [])),
            }
        )
    return examples


def get_example(scenario_id: str) -> dict[str, Any]:
    """Load, schema-validate, and reference-validate a bundled example scenario."""
    examples_dir = _examples_dir()
    known_ids = {path.stem for path in examples_dir.glob("*.json")}
    if scenario_id not in known_ids:
        raise ScenarioNotFoundError(f"Example scenario not found: {scenario_id}")
    raw = json.loads((examples_dir / f"{scenario_id}.json").read_text(encoding="utf-8"))
    return parse_and_validate(raw)


def load_uploaded_scenario(raw_bytes: bytes) -> dict[str, Any]:
    """Parse, schema-validate, and reference-validate an uploaded scenario file.

    Also accepts the app's own simulation-export envelope (``effective_scenario``
    at the top level, no ``meta``) so a scenario exported after editing can be
    re-uploaded as-is, without asking the user to extract the nested scenario
    by hand.
    """
    try:
        raw = json.loads(raw_bytes.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise InvalidScenarioError(f"Invalid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise InvalidScenarioError("Scenario JSON must be an object")
    if "meta" not in raw and isinstance(raw.get("effective_scenario"), dict):
        raw = raw["effective_scenario"]
    return parse_and_validate(raw)
