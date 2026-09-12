from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_isl_sensitivity_small_grid_returns_minimum() -> None:
    response = client.post(
        "/api/v1/optimization/isl-sensitivity",
        json={
            "scenario_id": "01_full_constellation",
            "isl_values_km": [1000, 3000],
            "refine": False,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert [p["isl_range_km"] for p in body["coarse_points"]] == [1000, 3000]
    assert body["minimum_isl_found"] is True
    assert body["minimum_isl_range_km"] == 3000


def test_isl_sensitivity_requires_scenario() -> None:
    response = client.post("/api/v1/optimization/isl-sensitivity", json={})
    assert response.status_code == 422


def test_isl_sensitivity_rejects_empty_grid() -> None:
    response = client.post(
        "/api/v1/optimization/isl-sensitivity",
        json={"scenario_id": "01_full_constellation", "isl_values_km": []},
    )
    assert response.status_code == 422
