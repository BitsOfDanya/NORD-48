"""Integration coverage for comparison and optimization APIs."""

from __future__ import annotations

import copy

from fastapi.testclient import TestClient

from app.main import app
from app.services import scenario_service

client = TestClient(app)


def _short_scenario() -> dict:
    scenario = scenario_service.get_example("01_full_constellation")
    scenario["meta"] = {"id": "short_test", "title": "Short test"}
    scenario["environment"]["horizon_s"] = 240
    scenario["failures"] = []
    scenario["gateway_outages"] = []
    return scenario


def _run(scenario: dict) -> dict:
    response = client.post("/api/v1/simulations/run", json={"scenario": scenario})
    assert response.status_code == 200
    return response.json()


def test_compare_runs_reports_parameter_and_metric_deltas() -> None:
    baseline = _short_scenario()
    variant = copy.deepcopy(baseline)
    variant["meta"]["id"] = "short_variant"
    variant["design"]["planes"][0]["raan_deg"] = 94

    baseline_run = _run(baseline)
    variant_run = _run(variant)
    response = client.post(
        "/api/v1/comparisons",
        json={"run_ids": [baseline_run["run_id"], variant_run["run_id"]]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["baseline_run_id"] == baseline_run["run_id"]
    assert len(body["variants"]) == 2
    paths = {change["path"] for change in body["variants"][1]["changed_parameters"]}
    assert "planes.P1.raan_deg" in paths


def test_optimizer_returns_exactly_evaluated_scenario_and_pareto_front() -> None:
    response = client.post(
        "/api/v1/optimization/run",
        json={
            "scenario": _short_scenario(),
            "maxiter": 1,
            "popsize": 3,
            "seed": 7,
            "pareto_limit": 4,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "scipy_differential_evolution_exact_verification"
    assert body["evaluated_candidates"] >= 18
    assert body["baseline"]["scenario_metrics"]
    assert body["recommended"]["scenario_metrics"]
    assert body["pareto_front"]
    assert body["recommended_scenario"]["meta"]["id"] == "short_test_optimized"
    assert body["recommended_scenario"]["environment"]["step_s"] == 120
