"""API tests for the failure-degradation async job.

Uses tiny `k_values`/`iterations` to stay fast — the real K=0..10 curve
with iterations=100 (see docs/degradation-analysis.md) takes a few
minutes and is exercised manually and recorded there.
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app


def _run_to_completion(client: TestClient, payload: dict) -> dict:
    response = client.post("/api/v1/resilience/failure-degradation/run", json=payload)
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    status = None
    for _ in range(200):
        status_response = client.get(f"/api/v1/resilience/failure-degradation/{run_id}")
        assert status_response.status_code == 200
        status = status_response.json()
        if status["status"] in {"completed", "failed"}:
            break
        time.sleep(0.1)
    assert status is not None and status["status"] == "completed", status
    result = client.get(f"/api/v1/resilience/failure-degradation/{run_id}/result")
    assert result.status_code == 200
    return result.json()


def test_failure_degradation_small_case_mixes_exact_and_monte_carlo() -> None:
    client = TestClient(app)
    result = _run_to_completion(
        client,
        {
            "scenario_id": "01_full_constellation",
            "k_values": [0, 1, 3],
            "iterations": 5,
            "seed": 1,
        },
    )
    points = {p["k"]: p for p in result["points"]}
    assert set(points) == {0, 1, 3}
    assert points[0]["method"] == "exact"
    assert points[0]["samples"] == 1
    assert points[1]["method"] == "exact"
    assert points[1]["samples"] == 48
    assert points[3]["method"] == "monte_carlo"
    assert points[3]["samples"] == 5
    for point in result["points"]:
        assert 0.0 <= point["target_survival_fraction"] <= 1.0


def test_failure_degradation_rejects_k_above_satellite_count() -> None:
    response = TestClient(app).post(
        "/api/v1/resilience/failure-degradation/run",
        json={"scenario_id": "01_full_constellation", "k_values": [999]},
    )
    assert response.status_code == 422


def test_failure_degradation_rejects_negative_k() -> None:
    response = TestClient(app).post(
        "/api/v1/resilience/failure-degradation/run",
        json={"scenario_id": "01_full_constellation", "k_values": [-1]},
    )
    assert response.status_code == 422


def test_failure_degradation_unknown_run_id_returns_404() -> None:
    client = TestClient(app)
    assert (
        client.get("/api/v1/resilience/failure-degradation/does-not-exist").status_code == 404
    )
