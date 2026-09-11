"""Regression check for the separately saved optimized design variant."""

import json
from pathlib import Path

import pytest

from app.services import simulation_service


def test_saved_optimized_variant_improves_full_constellation() -> None:
    path = (
        Path(__file__).resolve().parents[3]
        / "data"
        / "scenarios"
        / "variants"
        / "01_full_constellation_optimized.json"
    )
    scenario = json.loads(path.read_text(encoding="utf-8"))
    run = simulation_service.run_simulation(scenario, persist=False)

    assert run.metrics["C65"].availability_fraction == pytest.approx(0.9986111111)
    assert run.metrics["C65"].max_outage_s == 120
    assert run.metrics["C70"].availability_fraction == 1.0
    assert run.metrics["C72"].availability_fraction == 1.0
