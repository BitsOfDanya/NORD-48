from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models.simulation import SimulationRun
from app.services import scenario_service, simulation_service

client = TestClient(app)


def test_connectivity_margin_from_scenario() -> None:
    response = client.post(
        "/api/v1/resilience/connectivity-margin",
        json={
            "scenario_id": "01_full_constellation",
            "client_id": "C70",
            "timestamp": 21_600,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["client_id"] == "C70"
    assert body["timestamp"] == 21_600
    assert body["vertex_connectivity"] >= 1
    assert len(body["critical_satellites"]) == body["vertex_connectivity"]


def test_connectivity_margin_accepts_existing_run(monkeypatch) -> None:
    scenario = scenario_service.get_example("01_full_constellation")
    run = SimulationRun(
        run_id="connectivity-test-run",
        scenario=scenario,
        routing_strategy="minimum_hops",
        step_s=scenario["environment"]["step_s"],
        horizon_s=scenario["environment"]["horizon_s"],
        n_steps=scenario["environment"]["horizon_s"] // scenario["environment"]["step_s"],
        client_ids=["C65", "C70", "C72"],
        gateway_ids=["G_MUR"],
    )
    monkeypatch.setitem(simulation_service._RUNS, run.run_id, run)

    response = client.post(
        "/api/v1/resilience/connectivity-margin",
        json={"run_id": run.run_id, "client_id": "C65", "timestamp": 0},
    )

    assert response.status_code == 200
    assert response.json()["client_id"] == "C65"


def test_connectivity_margin_rejects_ambiguous_source() -> None:
    response = client.post(
        "/api/v1/resilience/connectivity-margin",
        json={
            "scenario_id": "01_full_constellation",
            "run_id": "some-run",
            "client_id": "C65",
            "timestamp": 0,
        },
    )

    assert response.status_code == 422


def test_connectivity_margin_rejects_unknown_client_and_timestamp() -> None:
    unknown_client = client.post(
        "/api/v1/resilience/connectivity-margin",
        json={
            "scenario_id": "01_full_constellation",
            "client_id": "UNKNOWN",
            "timestamp": 0,
        },
    )
    outside_horizon = client.post(
        "/api/v1/resilience/connectivity-margin",
        json={
            "scenario_id": "01_full_constellation",
            "client_id": "C65",
            "timestamp": 86_400,
        },
    )

    assert unknown_client.status_code == 422
    assert outside_horizon.status_code == 422


def test_daily_connectivity_aggregates_full_scenario_day() -> None:
    response = client.post(
        "/api/v1/resilience/connectivity-margin/daily",
        json={"scenario_id": "01_full_constellation", "client_id": "C70"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["client_id"] == "C70"
    assert body["step_s"] == 120
    assert len(body["days"]) == 1
    day = body["days"][0]
    assert day["samples_evaluated"] == 720
    assert day["minimum_vertex_connectivity"] >= 0
    assert day["mean_vertex_connectivity"] >= day["minimum_vertex_connectivity"]
