"""API-level integration tests for the deployment planner endpoints.

`max_search_size` caps the greedy sweep so these stay fast — the full
48-satellite sweep is a ~5 minute exact computation, exercised manually
(see docs/deployment-planner.md), not on every test run.
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app


def _run_to_completion(client: TestClient, payload: dict) -> dict:
    response = client.post("/api/v1/optimization/deployment-plan/run", json=payload)
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    status = None
    for _ in range(200):
        status_response = client.get(f"/api/v1/optimization/deployment-plan/{run_id}")
        assert status_response.status_code == 200
        status = status_response.json()
        if status["status"] in {"completed", "failed"}:
            break
        time.sleep(0.2)
    assert status is not None and status["status"] == "completed", status
    result = client.get(f"/api/v1/optimization/deployment-plan/{run_id}/result")
    assert result.status_code == 200
    return result.json()


def test_deployment_plan_end_to_end_small_sweep() -> None:
    client = TestClient(app)
    result = _run_to_completion(
        client,
        {
            "scenario_id": "01_full_constellation",
            "stage_sizes": [1, 2],
            "max_search_size": 2,
        },
    )
    assert result["search_capped"] is True
    assert result["searched_up_to_size"] == 2
    assert [s["size"] for s in result["stages"]] == [1, 2]
    assert len(result["size_curve"]) == 2
    for stage in result["stages"]:
        assert "worst_availability" in stage["subset"]
        assert 0.0 <= stage["subset"]["worst_availability"] <= 1.0


def test_deployment_plan_rejects_stage_size_over_fleet() -> None:
    response = TestClient(app).post(
        "/api/v1/optimization/deployment-plan/run",
        json={"scenario_id": "01_full_constellation", "stage_sizes": [999]},
    )
    assert response.status_code == 422


def test_deployment_plan_rejects_max_search_size_below_requested_stage() -> None:
    response = TestClient(app).post(
        "/api/v1/optimization/deployment-plan/run",
        json={
            "scenario_id": "01_full_constellation",
            "stage_sizes": [10],
            "max_search_size": 5,
        },
    )
    assert response.status_code == 422


def test_deployment_plan_unknown_run_id_returns_404() -> None:
    client = TestClient(app)
    assert client.get("/api/v1/optimization/deployment-plan/does-not-exist").status_code == 404
    assert (
        client.get("/api/v1/optimization/deployment-plan/does-not-exist/result").status_code
        == 404
    )


def test_deployment_plan_result_before_completion_returns_409() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/optimization/deployment-plan/run",
        # A single greedy step is still 48 exact simulations (~10s) — long
        # enough that the immediate, un-delayed status check below reliably
        # lands on "queued"/"running", short enough to not linger after the
        # test ends (the background thread isn't cancelled, only orphaned).
        json={"scenario_id": "01_full_constellation", "stage_sizes": [1], "max_search_size": 1},
    )
    run_id = response.json()["run_id"]
    status = client.get(f"/api/v1/optimization/deployment-plan/{run_id}").json()
    assert status["status"] in {"queued", "running"}
    result = client.get(f"/api/v1/optimization/deployment-plan/{run_id}/result")
    assert result.status_code == 409
