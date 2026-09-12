from __future__ import annotations

import json

import numpy as np
import pytest

from app.calculation.optimization.catboost_surrogate import fit_surrogate, load_pretrained
from app.calculation.optimization.search import optimize
from tests.unit.test_configuration_optimization import _toy_result


def test_saved_model_roundtrip_and_context_rejection(tmp_path, monkeypatch):
    monkeypatch.setenv("NORD48_CATBOOST_DIR", str(tmp_path))
    directory = tmp_path / "catboost-test"
    directory.mkdir()
    scenario = {"design": {"planes": [{"id": "P2", "raan_deg": 75, "phase_deg": 0}]}}
    names = ["P2.raan_deg"]
    vectors = np.arange(32, dtype=float).reshape(-1, 1)
    model = fit_surrogate(vectors, vectors[:, 0], 42)
    model.save_model(str(directory / "model.cbm"))
    (directory / "report.json").write_text(json.dumps({
        "scenario": scenario, "features": names, "routing_strategy": "minimum_hops",
        "target": "1 - worst_availability",
    }))
    baseline = {"P2.raan_deg": 75.0, "P2.phase_deg": 0.0}
    loaded, identifier = load_pretrained({"normal": scenario}, names, baseline, "minimum_hops", "normal")
    assert identifier == "catboost-test"
    np.testing.assert_allclose(loaded.predict([[0, 1]]), model.predict([[0, 1]]))
    for strategy, mode in [("minimum_distance", "normal"), ("minimum_hops", "robust")]:
        with pytest.raises(ValueError):
            load_pretrained({"normal": scenario}, names, baseline, strategy, mode)
    with pytest.raises(ValueError):
        load_pretrained({"normal": scenario}, names, baseline | {"P2.phase_deg": 1}, "minimum_hops", "normal")


def test_pretrained_shortlist_uses_no_training(monkeypatch):
    class Model:
        def predict(self, features):
            assert features.shape == (8192, 2)
            return np.arange(len(features))

    def forbidden(*args, **kwargs):
        pytest.fail("inference mode must never fit")

    monkeypatch.setattr("app.calculation.optimization.catboost_surrogate.fit_surrogate", forbidden)
    calls = []

    def evaluate(parameters, bypass):
        calls.append(bypass)
        return _toy_result(parameters)

    result = optimize(
        {"P2.raan_deg": 75.0}, ["P2.raan_deg"], {"P2.raan_deg": (0.0, 100.0)},
        100, 42, "catboost_pretrained", 100, False, evaluate, pretrained_model=Model(),
    )
    assert result["evaluated"] == calls.count(False) == 16
    assert calls.count(True) == 5
    assert result["surrogate_fits"] == 0
    assert result["surrogate_predictions"] == 8192
