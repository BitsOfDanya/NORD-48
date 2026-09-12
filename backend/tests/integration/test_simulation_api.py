"""API-level integration tests for the scenario/simulation endpoints."""

import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_list_examples() -> None:
    response = client.get("/api/v1/scenarios/examples")
    assert response.status_code == 200
    ids = {e["id"] for e in response.json()}
    assert ids == {
        "01_full_constellation",
        "02_first_launch",
        "03_satellite_outages",
        "04_link_range",
    }


def test_get_example_scenario() -> None:
    response = client.get("/api/v1/scenarios/examples/01_full_constellation")
    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "cosmo-A-1.0"
    assert len(body["design"]["satellites"]) == 48


def test_get_unknown_example_returns_404() -> None:
    response = client.get("/api/v1/scenarios/examples/does_not_exist")
    assert response.status_code == 404


def test_upload_valid_scenario() -> None:
    scenario_json = client.get("/api/v1/scenarios/examples/01_full_constellation").content
    response = client.post(
        "/api/v1/scenarios/upload",
        files={"file": ("scenario.json", io.BytesIO(scenario_json), "application/json")},
    )
    assert response.status_code == 200
    assert response.json()["schema_version"] == "cosmo-A-1.0"


def test_upload_accepts_own_export_envelope() -> None:
    """A user edits a scenario, runs it, exports the result, then re-uploads
    that same file to iterate — the export wraps the scenario in
    `effective_scenario` alongside routes/summary, so upload must unwrap it."""
    run_response = client.post(
        "/api/v1/simulations/run", json={"scenario_id": "01_full_constellation"}
    )
    run_id = run_response.json()["run_id"]
    export_bytes = client.get(f"/api/v1/simulations/{run_id}/export").content

    response = client.post(
        "/api/v1/scenarios/upload",
        files={"file": ("nord48-export.json", io.BytesIO(export_bytes), "application/json")},
    )

    assert response.status_code == 200
    assert response.json()["meta"]["id"] == "01_full_constellation"


def test_upload_invalid_json_returns_422() -> None:
    response = client.post(
        "/api/v1/scenarios/upload",
        files={"file": ("bad.json", io.BytesIO(b"{not valid"), "application/json")},
    )
    assert response.status_code == 422


def test_run_requires_scenario_id_or_scenario() -> None:
    response = client.post("/api/v1/simulations/run", json={})
    assert response.status_code == 422


def test_run_unknown_scenario_id_returns_404() -> None:
    response = client.post("/api/v1/simulations/run", json={"scenario_id": "nope"})
    assert response.status_code == 404


def _run_full_constellation() -> dict:
    response = client.post(
        "/api/v1/simulations/run",
        json={"scenario_id": "01_full_constellation", "routing_strategy": "minimum_hops"},
    )
    assert response.status_code == 200
    return response.json()


def test_run_simulation_and_read_summary() -> None:
    summary = _run_full_constellation()
    assert summary["client_ids"] == ["C65", "C70", "C72"]
    assert summary["gateway_ids"] == ["G_MUR"]
    assert summary["n_steps"] == 720
    assert summary["metrics"]["C65"]["target_achieved"] is True

    run_id = summary["run_id"]
    response = client.get(f"/api/v1/simulations/{run_id}")
    assert response.status_code == 200
    assert response.json()["run_id"] == run_id


def test_get_metrics() -> None:
    run_id = _run_full_constellation()["run_id"]
    response = client.get(f"/api/v1/simulations/{run_id}/metrics")
    assert response.status_code == 200
    assert set(response.json().keys()) == {"C65", "C70", "C72"}


def test_metrics_include_outage_quality_detail() -> None:
    run_id = _run_full_constellation()["run_id"]
    response = client.get(f"/api/v1/simulations/{run_id}/metrics")
    quality = response.json()["C65"]["outage_quality"]
    assert quality["p95_outage_s"] >= quality["median_outage_s"] >= 0
    assert quality["total_outage_s"] >= quality["mean_outage_s"] >= 0


def test_get_snapshot() -> None:
    run_id = _run_full_constellation()["run_id"]
    response = client.get(f"/api/v1/simulations/{run_id}/snapshot", params={"t_s": 21600})
    assert response.status_code == 200
    body = response.json()
    assert len(body["satellites"]) == 48
    assert "lat_deg" in body["satellites"][0]
    assert "routes" in body
    assert set(body["routes"].keys()) == {"C65", "C70", "C72"}


def test_get_route() -> None:
    run_id = _run_full_constellation()["run_id"]
    response = client.get(
        f"/api/v1/simulations/{run_id}/route", params={"client_id": "C70", "t_s": 21600}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["path"][0] == "C70"
    assert body["path"][-1] == "G_MUR"


def test_get_route_includes_explanation_only_when_unavailable() -> None:
    available_response = client.post(
        "/api/v1/simulations/run",
        json={"scenario_id": "01_full_constellation", "routing_strategy": "minimum_hops"},
    )
    run_id = available_response.json()["run_id"]
    available_route = client.get(
        f"/api/v1/simulations/{run_id}/route", params={"client_id": "C65", "t_s": 0}
    ).json()
    assert available_route["available"] is True
    assert "explanation" not in available_route

    outage_response = client.post(
        "/api/v1/simulations/run",
        json={"scenario_id": "04_link_range", "routing_strategy": "minimum_hops"},
    )
    outage_run_id = outage_response.json()["run_id"]
    timeline = client.get(f"/api/v1/simulations/{outage_run_id}/timeline").json()
    outage_step = next(
        (r for r in timeline["C65"] if not r["available"]), None
    )
    assert outage_step is not None
    route = client.get(
        f"/api/v1/simulations/{outage_run_id}/route",
        params={"client_id": "C65", "t_s": outage_step["t_s"]},
    ).json()
    assert route["available"] is False
    assert "explanation" in route
    explanation = route["explanation"]
    assert explanation["visible_satellite_count"] >= 0
    assert isinstance(explanation["network_component_count"], int)
    # `diagnostic_reason` (existing field) and the explanation must agree —
    # the explainer must never invent a different reason.
    assert route["diagnostic_reason"] == outage_step["diagnostic_reason"]


def test_get_route_includes_backup_path_field_when_available() -> None:
    run_id = _run_full_constellation()["run_id"]
    route = client.get(
        f"/api/v1/simulations/{run_id}/route", params={"client_id": "C65", "t_s": 0}
    ).json()
    assert route["available"] is True
    assert "backup_path" in route
    if route["backup_path"] is not None:
        assert route["backup_path"][0] == "C65"
        primary_intermediate = set(route["path"][1:-1])
        backup_intermediate = set(route["backup_path"][1:-1])
        assert primary_intermediate.isdisjoint(backup_intermediate)


def test_get_route_backup_path_is_null_when_route_unavailable() -> None:
    outage_response = client.post(
        "/api/v1/simulations/run",
        json={"scenario_id": "04_link_range", "routing_strategy": "minimum_hops"},
    )
    outage_run_id = outage_response.json()["run_id"]
    timeline = client.get(f"/api/v1/simulations/{outage_run_id}/timeline").json()
    outage_step = next((r for r in timeline["C65"] if not r["available"]), None)
    assert outage_step is not None
    route = client.get(
        f"/api/v1/simulations/{outage_run_id}/route",
        params={"client_id": "C65", "t_s": outage_step["t_s"]},
    ).json()
    assert route["backup_path"] is None


def test_get_route_unknown_client_returns_404() -> None:
    run_id = _run_full_constellation()["run_id"]
    response = client.get(
        f"/api/v1/simulations/{run_id}/route", params={"client_id": "NOPE", "t_s": 0}
    )
    assert response.status_code == 404


def test_get_timeline() -> None:
    run_id = _run_full_constellation()["run_id"]
    response = client.get(f"/api/v1/simulations/{run_id}/timeline")
    assert response.status_code == 200
    body = response.json()
    assert len(body["C65"]) == 720
    assert body["C65"][0]["t_s"] == 0


def test_get_export() -> None:
    run_id = _run_full_constellation()["run_id"]
    response = client.get(f"/api/v1/simulations/{run_id}/export")
    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "cosmo-A-result-1.0"
    assert len(body["routes"]) == 720 * 3  # 3 clients


def test_unknown_run_id_returns_404() -> None:
    response = client.get("/api/v1/simulations/does-not-exist")
    assert response.status_code == 404


def test_validate_runs_separates_existing_and_stale_ids() -> None:
    run_id = _run_full_constellation()["run_id"]
    stale_id = "00000000-0000-0000-0000-000000000000"

    response = client.post(
        "/api/v1/simulations/validate",
        json={"run_ids": [run_id, stale_id]},
    )

    assert response.status_code == 200
    assert response.json() == {"existing": [run_id], "missing": [stale_id]}


def test_no_route_has_empty_path_and_diagnostic_reason() -> None:
    response = client.post(
        "/api/v1/simulations/run",
        json={"scenario_id": "02_first_launch", "routing_strategy": "minimum_hops"},
    )
    run_id = response.json()["run_id"]

    timeline = client.get(f"/api/v1/simulations/{run_id}/timeline").json()
    outage_step = next(r for r in timeline["C72"] if not r["available"])

    route = client.get(
        f"/api/v1/simulations/{run_id}/route",
        params={"client_id": "C72", "t_s": outage_step["t_s"]},
    ).json()

    assert route["path"] == []
    assert route["diagnostic_reason"] in {
        "NO_VISIBLE_SATELLITE",
        "NO_GATEWAY_CONTACT",
        "GATEWAY_OUTAGE",
        "ISL_NETWORK_SPLIT",
    }
