from fastapi.testclient import TestClient

from app.main import app


def test_routing_analysis_returns_all_strategies_and_segment_metrics() -> None:
    response = TestClient(app).post(
        "/api/v1/resilience/routing-analysis",
        json={"scenario_id": "02_first_launch"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lifetime_sample"] == "route_segments"
    assert body["strategies"] == [
        "minimum_hops",
        "minimum_distance",
        "maximum_margin",
        "maximum_persistence",
    ]
    assert len(body["rows"]) == 12
    assert all("median_route_lifetime_s" in row for row in body["rows"])
    assert body["recommended_strategy"] in body["strategies"]


def test_route_response_keeps_old_fields_and_adds_optional_lifetime() -> None:
    client = TestClient(app)
    run = client.post(
        "/api/v1/simulations/run",
        json={"scenario_id": "04_link_range", "routing_strategy": "minimum_hops"},
    ).json()
    route = client.get(
        f"/api/v1/simulations/{run['run_id']}/route",
        params={"client_id": "C70", "t_s": 21600},
    ).json()
    assert route["path"] == ["C70", "S09", "G_MUR"]
    assert route["route_lifetime_s"] == 360
    assert route["route_valid_until_s"] == 21960
