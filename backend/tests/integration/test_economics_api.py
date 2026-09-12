from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_estimate_resource_only_when_no_cost_given() -> None:
    response = client.post(
        "/api/v1/economics/estimate",
        json={"satellite_count": 45, "total_satellites": 48, "launch_batches_used": 3},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "resource_only"
    assert body["cost"] is None
    assert body["resources"]["satellite_count"] == 45


def test_estimate_cost_mode_when_unit_cost_given() -> None:
    response = client.post(
        "/api/v1/economics/estimate",
        json={
            "satellite_count": 45,
            "total_satellites": 48,
            "launch_batches_used": 3,
            "satellite_unit_cost_rub": 10_000_000,
            "launch_fixed_cost_rub": 10_000_000,
            "launch_capacity_satellites": 16,
            "worst_availability_percent": 91.53,
            "source_label": "Sitronics, 2021 historical estimate",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "cost"
    assert body["cost"]["estimated_satellite_cost_rub"] == 45 * 10_000_000
    assert body["cost"]["estimated_launches"] == 3
    assert body["cost"]["source_label"] == "Sitronics, 2021 historical estimate"
    assert body["cost_per_availability_point_rub"] is not None


def test_estimate_rejects_invalid_satellite_count() -> None:
    response = client.post(
        "/api/v1/economics/estimate", json={"satellite_count": 0, "total_satellites": 48}
    )
    assert response.status_code == 422
