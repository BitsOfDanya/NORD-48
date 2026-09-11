"""API-level integration tests for POST /api/v1/comparisons."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _run(scenario_id: str, routing_strategy: str = "minimum_hops") -> str:
    response = client.post(
        "/api/v1/simulations/run",
        json={"scenario_id": scenario_id, "routing_strategy": routing_strategy},
    )
    assert response.status_code == 200
    return response.json()["run_id"]


def test_compare_two_runs_reports_deltas_from_first_as_baseline() -> None:
    run_a = _run("01_full_constellation", "minimum_hops")
    run_b = _run("01_full_constellation", "maximum_margin")

    response = client.post("/api/v1/comparisons", json={"run_ids": [run_a, run_b]})

    assert response.status_code == 200
    body = response.json()
    assert body["baseline_run_id"] == run_a
    variants = {v["run_id"]: v for v in body["variants"]}
    assert variants[run_a]["is_baseline"] is True
    assert variants[run_b]["is_baseline"] is False
    for delta in variants[run_a]["deltas_from_baseline"].values():
        assert delta["availability_percent"] == 0.0
        assert delta["max_outage_s"] == 0


def test_compare_explicit_baseline_selection() -> None:
    run_a = _run("01_full_constellation")
    run_b = _run("03_satellite_outages")

    response = client.post(
        "/api/v1/comparisons",
        json={"run_ids": [run_a, run_b], "baseline_run_id": run_b},
    )

    assert response.status_code == 200
    assert response.json()["baseline_run_id"] == run_b


def test_compare_reports_configuration_changes() -> None:
    run_a = _run("01_full_constellation")
    run_b = _run("04_link_range")

    response = client.post("/api/v1/comparisons", json={"run_ids": [run_a, run_b]})

    body = response.json()
    variant_b = next(v for v in body["variants"] if v["run_id"] == run_b)
    changed_paths = {change["path"] for change in variant_b["changed_parameters"]}
    assert "isl_range_km" in changed_paths


def test_compare_rejects_mismatched_time_grid() -> None:
    run_a = _run("01_full_constellation")
    scenario = client.get("/api/v1/scenarios/examples/01_full_constellation").json()
    scenario["environment"]["step_s"] = 240
    scenario["meta"]["id"] = "custom_step"
    run_response = client.post(
        "/api/v1/simulations/run",
        json={"scenario": scenario, "routing_strategy": "minimum_hops"},
    )
    assert run_response.status_code == 200
    run_b = run_response.json()["run_id"]

    response = client.post("/api/v1/comparisons", json={"run_ids": [run_a, run_b]})
    assert response.status_code == 422


def test_compare_requires_at_least_two_runs() -> None:
    run_a = _run("01_full_constellation")
    response = client.post("/api/v1/comparisons", json={"run_ids": [run_a]})
    assert response.status_code == 422


def test_compare_baseline_must_be_among_run_ids() -> None:
    run_a = _run("01_full_constellation")
    run_b = _run("02_first_launch")
    response = client.post(
        "/api/v1/comparisons",
        json={"run_ids": [run_a, run_b], "baseline_run_id": "not-a-real-run-id"},
    )
    assert response.status_code == 422


def test_compare_unknown_run_id_returns_404() -> None:
    run_a = _run("01_full_constellation")
    response = client.post(
        "/api/v1/comparisons", json={"run_ids": [run_a, "00000000-0000-0000-0000-000000000000"]}
    )
    assert response.status_code == 404
