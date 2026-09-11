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


def _run_to_completion(client: TestClient, payload: dict) -> dict:
    response = client.post("/api/v1/optimization/run", json=payload)
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    status = None
    for _ in range(100):
        status_response = client.get(f"/api/v1/optimization/{run_id}")
        assert status_response.status_code == 200
        status = status_response.json()
        if status["status"] in {"completed", "failed"}:
            break
        time.sleep(0.1)
    assert status is not None and status["status"] == "completed", status
    result = client.get(f"/api/v1/optimization/{run_id}/result")
    assert result.status_code == 200
    return result.json()


def test_constrained_robust_requires_scenario_id_among_stress_profiles() -> None:
    response = TestClient(app).post(
        "/api/v1/optimization/run",
        json={
            "scenario_id": "01_full_constellation",
            "mode": "constrained_robust",
            "stress_profile_ids": ["03_satellite_outages", "04_link_range"],
            "variable_parameters": ["P2.raan_deg"],
            "budget": 1,
        },
    )
    assert response.status_code == 422


def test_constrained_robust_requires_a_degraded_profile() -> None:
    response = TestClient(app).post(
        "/api/v1/optimization/run",
        json={
            "scenario_id": "01_full_constellation",
            "mode": "constrained_robust",
            "stress_profile_ids": ["01_full_constellation"],
            "variable_parameters": ["P2.raan_deg"],
            "budget": 1,
        },
    )
    assert response.status_code == 422


def test_constrained_robust_end_to_end_never_recommends_infeasible_normal_over_feasible() -> None:
    client = TestClient(app)
    result = _run_to_completion(
        client,
        {
            "scenario_id": "01_full_constellation",
            "mode": "constrained_robust",
            "stress_profile_ids": ["01_full_constellation", "03_satellite_outages"],
            "variable_parameters": ["P2.raan_deg"],
            "budget": 4,
            "algorithm": "random",
            "initial_exploration_size": 2,
            "seed": 7,
        },
    )
    assert result["mode"] == "constrained_robust"
    best = result["best"]
    normal_row = next(s for s in best["scenarios"] if s["profile"] == "01_full_constellation")
    baseline_normal_row = next(
        s for s in result["baseline"]["scenarios"] if s["profile"] == "01_full_constellation"
    )
    # The baseline (unmodified angles) is always exactly the current main
    # already achieves >=90% in the normal scenario, so it is feasible —
    # a correct constrained search must never pick a worse-than-baseline
    # normal-profile candidate as "best" when a feasible one exists.
    if all(c["target_reached"] for c in baseline_normal_row["clients"]):
        assert all(c["target_reached"] for c in normal_row["clients"])
    assert "pareto_front" in result
    assert isinstance(result["pareto_front"], list)
