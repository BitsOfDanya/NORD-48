from fastapi.testclient import TestClient

from app.main import app


def test_failure_analysis_response_contains_baseline_delta_and_timeline() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/resilience/failure-analysis",
        json={
            "scenario_id": "01_full_constellation",
            "satellite_ids": ["S14"],
            "failure_start_s": 21600,
            "failure_end_s": 64800,
            "routing_strategy": "minimum_hops",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["experiment"]["satellite_ids"] == ["S14"]
    assert len(body["clients"]) == 3
    assert len(body["timeline_impact"]["C65"]) == 720
    assert "failure_induced" in body["clients"][0]["diagnostics"]
    assert "availability_pp" in body["clients"][0]["delta"]


def test_failure_analysis_rejects_zero_duration_and_unknown_satellite() -> None:
    client = TestClient(app)
    base = {
        "scenario_id": "01_full_constellation",
        "satellite_ids": ["S14"],
        "failure_start_s": 120,
        "failure_end_s": 120,
    }
    assert client.post("/api/v1/resilience/failure-analysis", json=base).status_code == 422
    base.update(failure_end_s=240, satellite_ids=["UNKNOWN"])
    assert client.post("/api/v1/resilience/failure-analysis", json=base).status_code == 422


def test_n1_api_processes_each_active_first_launch_satellite() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/resilience/criticality/n1",
        json={
            "scenario_id": "02_first_launch",
            "analysis_start_s": 0,
            "analysis_end_s": 120,
            "routing_strategy": "minimum_hops",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["experiment"]["satellites_analyzed"] == 16
    assert body["experiment"]["baseline_geometry_runs"] == 1
    assert [row["rank"] for row in body["ranking"]] == list(range(1, 17))
