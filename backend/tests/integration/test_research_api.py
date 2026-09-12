import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_ml_report_uses_committed_repo_artifact() -> None:
    """No env override — must find the real ml/artifacts/catboost-*/report.json."""
    response = client.get("/api/v1/research/ml")
    assert response.status_code == 200
    body = response.json()
    assert body["artifact_id"] == "catboost-20260912T190729172811Z"
    assert body["scenario_id"] == "01_full_constellation"
    assert body["routing_strategy"] == "minimum_hops"
    assert body["target"] == "1 - worst_availability"
    assert body["seed"] == 42
    assert body["training_samples"] == 256
    assert body["holdout_samples"] == 64
    assert body["mae"] == 0.08143379328579364
    assert body["rmse"] == 0.09305871028321722
    assert body["mean_baseline_mae"] == 0.1555972629123264


def test_ml_report_reads_latest_artifact_by_directory_name(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("NORD48_CATBOOST_DIR", str(tmp_path))
    older = tmp_path / "catboost-20200101T000000000000Z"
    newer = tmp_path / "catboost-20300101T000000000000Z"
    older.mkdir()
    newer.mkdir()
    report = {
        "training_samples": 8, "holdout_samples": 2, "seed": 1,
        "features": ["P2.raan_deg"], "scenario": {"meta": {"id": "toy"}},
        "target": "1 - worst_availability", "routing_strategy": "minimum_hops",
        "mae": 0.1, "rmse": 0.2, "mean_baseline_mae": 0.3,
    }
    (older / "report.json").write_text(json.dumps({**report, "mae": 0.9}))
    (newer / "report.json").write_text(json.dumps(report))

    response = client.get("/api/v1/research/ml")
    assert response.status_code == 200
    body = response.json()
    assert body["artifact_id"] == "catboost-20300101T000000000000Z"
    assert body["mae"] == 0.1


def test_ml_report_missing_artifacts_dir_returns_404(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("NORD48_CATBOOST_DIR", str(tmp_path / "does-not-exist"))
    response = client.get("/api/v1/research/ml")
    assert response.status_code == 404
