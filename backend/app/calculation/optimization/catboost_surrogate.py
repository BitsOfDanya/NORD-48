"""Scenario-local surrogate of the scalar minimized by the exact search."""

from __future__ import annotations

import numpy as np
from catboost import CatBoostRegressor


def load_pretrained(scenarios, variable_names, baseline, strategy, mode):
    """Load only a model whose full simulation context matches its training report."""
    import json
    import os
    from pathlib import Path

    root = Path(os.environ.get(
        "NORD48_CATBOOST_DIR",
        str(Path(__file__).resolve().parents[4] / "ml" / "artifacts"),
    ))
    if mode != "normal" or len(scenarios) != 1:
        raise ValueError("Сохранённая модель поддерживает только штатный режим normal")
    scenario = next(iter(scenarios.values()))
    for report_path in sorted(root.glob("catboost-*/report.json"), reverse=True):
        report = json.loads(report_path.read_text())
        if (report.get("scenario") != scenario
                or report.get("features") != variable_names
                or report.get("routing_strategy") != strategy
                or report.get("target") != "1 - worst_availability"):
            continue
        trained = {f"{p['id']}.{f}": float(p[f])
                   for p in scenario["design"]["planes"] for f in ("raan_deg", "phase_deg")}
        if any(baseline[n] != v for n, v in trained.items() if n not in variable_names):
            continue
        model = CatBoostRegressor()
        model.load_model(str(report_path.parent / "model.cbm"))
        return model, report_path.parent.name
    raise ValueError(
        "Нет совместимой сохранённой модели: нужны тот же сценарий, стратегия и набор "
        "параметров. Выполните scripts/train_catboost.py или выберите CatBoost с обучением."
    )


def angle_features(vectors: np.ndarray) -> np.ndarray:
    """Encode periodic orbital angles without a discontinuity at 360 degrees."""
    radians = np.deg2rad(np.asarray(vectors, dtype=float))
    return np.concatenate((np.sin(radians), np.cos(radians)), axis=1)


def fit_surrogate(vectors: np.ndarray, targets: np.ndarray, seed: int) -> CatBoostRegressor:
    model = CatBoostRegressor(
        iterations=200, depth=5, learning_rate=0.05, loss_function="RMSE",
        random_seed=seed, thread_count=1, verbose=False,
        allow_writing_files=False, allow_const_label=True,
    )
    model.fit(angle_features(vectors), targets)
    return model
