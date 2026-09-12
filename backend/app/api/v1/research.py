"""Read-only reporting of committed ML research artifacts.

No training, no inference, no simulation happens here — this endpoint only
parses the `report.json` written by `scripts/train_catboost.py` and already
committed under `ml/artifacts/`. It exists so the frontend Research page has
one source of truth instead of hand-copied numbers.
"""

import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["research"])


class CatBoostSurrogateReport(BaseModel):
    artifact_id: str
    scenario_id: str
    routing_strategy: str
    target: str
    features: list[str]
    seed: int
    training_samples: int
    holdout_samples: int
    mae: float
    rmse: float
    mean_baseline_mae: float


def _artifacts_root() -> Path:
    return Path(os.environ.get(
        "NORD48_CATBOOST_DIR",
        str(Path(__file__).resolve().parents[4] / "ml" / "artifacts"),
    ))


@router.get("/ml", response_model=CatBoostSurrogateReport)
async def get_catboost_report() -> CatBoostSurrogateReport:
    root = _artifacts_root()
    candidates = sorted(root.glob("catboost-*/report.json"), reverse=True)
    if not candidates:
        raise HTTPException(status_code=404, detail="Нет сохранённого CatBoost-артефакта")
    report_path = candidates[0]
    report = json.loads(report_path.read_text())
    return CatBoostSurrogateReport(
        artifact_id=report_path.parent.name,
        scenario_id=report["scenario"]["meta"]["id"],
        routing_strategy=report["routing_strategy"],
        target=report["target"],
        features=report["features"],
        seed=report["seed"],
        training_samples=report["training_samples"],
        holdout_samples=report["holdout_samples"],
        mae=report["mae"],
        rmse=report["rmse"],
        mean_baseline_mae=report["mean_baseline_mae"],
    )
