from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app


def test_async_optimization_lifecycle_and_result() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/optimization/run",
        json={
            "scenario_id": "01_full_constellation",
            "variable_parameters": ["P2.raan_deg"],
            "budget": 1,
            "algorithm": "random",
            "initial_exploration_size": 0,
        },
    )
    assert response.status_code == 202
    run_id = response.json()["run_id"]
    status = None
    for _ in range(40):
        status_response = client.get(f"/api/v1/optimization/{run_id}")
        assert status_response.status_code == 200
        status = status_response.json()
        if status["status"] in {"completed", "failed"}:
            break
        time.sleep(0.1)
    assert status is not None and status["status"] == "completed"
    result = client.get(f"/api/v1/optimization/{run_id}/result")
    assert result.status_code == 200
    assert result.json()["evaluated"] == 1
    assert result.json()["revalidated_candidates"] == 1
    dataset = client.get(f"/api/v1/optimization/{run_id}/dataset?format=csv")
    assert dataset.status_code == 200
    assert "P2.raan_deg" in dataset.text


def test_optimization_rejects_unknown_parameter() -> None:
    response = TestClient(app).post(
        "/api/v1/optimization/run",
        json={"variable_parameters": ["P9.altitude"]},
    )
    assert response.status_code == 422
