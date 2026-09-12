"""API tests for the threshold-verification async job.

Uses tiny `sizes`/`max_passes` to stay fast — the real N=40..45 sweep with
swap refinement (see docs/design-threshold-verification.md) is a
multi-minute exact computation, exercised manually and recorded there, not
on every test run.
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app


def _run_to_completion(client: TestClient, payload: dict) -> dict:
    response = client.post("/api/v1/optimization/threshold-verification/run", json=payload)
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    status = None
    for _ in range(300):
        status_response = client.get(f"/api/v1/optimization/threshold-verification/{run_id}")
        assert status_response.status_code == 200
        status = status_response.json()
        if status["status"] in {"completed", "failed"}:
            break
        time.sleep(0.2)
    assert status is not None and status["status"] == "completed", status
    result = client.get(f"/api/v1/optimization/threshold-verification/{run_id}/result")
    assert result.status_code == 200
    return result.json()


def test_threshold_verification_small_case() -> None:
    client = TestClient(app)
    result = _run_to_completion(
        client,
        {
            "scenario_id": "01_full_constellation",
            "sizes": [1, 2],
            "max_passes": 1,
        },
    )
    assert result["sizes_tested"] == [1, 2]
    assert len(result["points"]) == 2
    for point in result["points"]:
        assert "target_margin_pp" in point
        assert "swaps_applied" in point
    assert "marginal_gain_curve" in result
    assert len(result["marginal_gain_curve"]) == 2


def test_threshold_verification_rejects_oversized() -> None:
    response = TestClient(app).post(
        "/api/v1/optimization/threshold-verification/run",
        json={"scenario_id": "01_full_constellation", "sizes": [999]},
    )
    assert response.status_code == 422


def test_threshold_verification_unknown_run_id_returns_404() -> None:
    client = TestClient(app)
    assert (
        client.get("/api/v1/optimization/threshold-verification/does-not-exist").status_code
        == 404
    )
