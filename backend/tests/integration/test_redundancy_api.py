from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_redundancy_endpoint_returns_bounded_percentages() -> None:
    response = client.post(
        "/api/v1/resilience/redundancy",
        json={"scenario_id": "01_full_constellation", "routing_strategy": "minimum_hops"},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body["clients"].keys()) == {"C65", "C70", "C72"}
    for stats in body["clients"].values():
        total = stats["no_route_percent"] + stats["single_path_percent"] + stats["backup_path_percent"]
        assert total == 100.0


def test_redundancy_endpoint_requires_scenario() -> None:
    response = client.post("/api/v1/resilience/redundancy", json={"routing_strategy": "minimum_hops"})
    assert response.status_code == 422


def test_redundancy_endpoint_unknown_scenario_returns_404() -> None:
    response = client.post(
        "/api/v1/resilience/redundancy",
        json={"scenario_id": "does_not_exist", "routing_strategy": "minimum_hops"},
    )
    assert response.status_code == 404
