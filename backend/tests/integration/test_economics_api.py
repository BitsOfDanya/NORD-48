from __future__ import annotations

import pytest
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


@pytest.mark.parametrize(
    ("satellites", "capacity", "launches"), [(48, 16, 3), (45, 16, 3), (16, 16, 1), (17, 16, 2)]
)
def test_resources_calculate_launches_without_any_prices(
    satellites: int, capacity: int, launches: int
) -> None:
    response = client.post(
        "/api/v1/economics/estimate",
        json={
            "satellite_count": satellites,
            "total_satellites": 48,
            "launch_batches_used": 1,
            "launch_capacity_satellites": capacity,
            "satellite_unit_cost_rub": None,
            "launch_fixed_cost_rub": None,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["mode"] == "resource_only"
    assert result["cost"] is None
    assert result["resources"]["estimated_launches"] == launches
    assert result["resources"]["launch_batches_used"] == 1  # batches are not physical launches


@pytest.mark.parametrize("capacity", [0, -1, 1.5])
def test_resources_reject_invalid_launch_capacity(capacity: float) -> None:
    response = client.post(
        "/api/v1/economics/estimate",
        json={
            "satellite_count": 48,
            "total_satellites": 48,
            "launch_capacity_satellites": capacity,
        },
    )
    assert response.status_code == 422


def test_resources_reject_more_satellites_than_constellation() -> None:
    response = client.post(
        "/api/v1/economics/estimate", json={"satellite_count": 49, "total_satellites": 48}
    )
    assert response.status_code == 422
