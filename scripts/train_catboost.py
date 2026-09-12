"""Train on full-day exact labels and report independent holdout error.

Run: backend/.venv/bin/python scripts/train_catboost.py --samples 256 --holdout 64
Artifacts can be loaded by the catboost_pretrained search mode.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

def main() -> None:
    from app.calculation.optimization.catboost_surrogate import angle_features, fit_surrogate
    from app.calculation.optimization.configuration import evaluate_configuration, plane_parameters
    from app.services.scenario_service import get_example

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=256)
    parser.add_argument("--holdout", type=int, default=64)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.samples < 32 or args.holdout < 2:
        parser.error("require samples >= 32 and holdout >= 2")
    scenario = get_example("01_full_constellation")
    baseline = plane_parameters(scenario)
    names = ["P2.raan_deg", "P3.raan_deg", "P2.phase_deg", "P3.phase_deg"]
    vectors = np.random.default_rng(args.seed).uniform(0, 360, (args.samples + args.holdout, 4))
    output = ROOT / "ml/artifacts" / datetime.now(UTC).strftime("catboost-%Y%m%dT%H%M%S%fZ")
    output.mkdir(parents=True, exist_ok=False)
    targets = []
    with (output / "dataset.jsonl").open("w") as stream:
        for index, vector in enumerate(vectors):
            parameters = baseline | dict(zip(names, map(float, vector), strict=True))
            result = evaluate_configuration({"normal": scenario}, parameters, "minimum_hops")
            targets.append(1.0 - result["aggregates"]["worst_availability"])
            stream.write(json.dumps({"split": "train" if index < args.samples else "holdout", **result}) + "\n")
            if (index + 1) % 32 == 0:
                print(f"Exact labels: {index + 1}/{len(vectors)}", flush=True)
    y = np.array(targets)
    model = fit_surrogate(vectors[:args.samples], y[:args.samples], args.seed)
    predicted = np.asarray(model.predict(angle_features(vectors[args.samples:])))
    truth = y[args.samples:]
    report = {
        "training_samples": args.samples, "holdout_samples": args.holdout,
        "seed": args.seed, "features": names, "scenario": scenario,
        "target": "1 - worst_availability", "routing_strategy": "minimum_hops",
        "mae": float(np.mean(np.abs(predicted - truth))),
        "rmse": float(np.sqrt(np.mean((predicted - truth) ** 2))),
        "mean_baseline_mae": float(np.mean(np.abs(y[:args.samples].mean() - truth))),
        "usage": "Compatible with catboost_pretrained for this scenario, features and objective.",
    }
    model.save_model(str(output / "model.cbm"))
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "scenario"}, indent=2))
    print(f"Artifacts: {output}")


if __name__ == "__main__":
    main()
