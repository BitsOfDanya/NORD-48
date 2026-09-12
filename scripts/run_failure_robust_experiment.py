"""Run the full-day robustness experiment and retain reproducible results.

Usage: backend/.venv/bin/python scripts/run_failure_robust_experiment.py
"""

from __future__ import annotations

import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.calculation.optimization.configuration import (
    apply_plane_parameters,
    evaluate_configuration,
    plane_parameters,
)
from app.services.optimization_service import run_optimization
from app.services.scenario_service import get_example


def main() -> None:
    output = (
        ROOT
        / "data/results/failure_robust"
        / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    )
    output.mkdir(parents=True, exist_ok=False)

    def save(name: str, value: object) -> None:
        (output / name).write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    normal = get_example("01_full_constellation")
    fixed = get_example("03_satellite_outages")
    variables = ["P2.raan_deg", "P3.raan_deg", "P2.phase_deg", "P3.phase_deg"]
    settings = {
        "variable_names": variables,
        "bounds": {name: (0.0, 360.0) for name in variables},
        "routing_strategy": "minimum_hops",
        "budget": 25,
        "seed": 42,
        "algorithm": "toroidal_differential_evolution",
        "initial_exploration_size": 0,
        "stop_on_target": False,
        "polish": False,
        "mode": "failure_cvar",
        "normal_profile": "01_full_constellation",
        "fixed_failure_profile": "03_satellite_outages",
        "failure_count": 10,
        "failure_random_samples": 8,
        "failure_correlated_samples": 6,
        "cvar_alpha": 0.1,
        "adversarial_rounds": 2,
        "adversarial_search_budget": 120,
        "adversarial_cases_per_round": 3,
        "adversarial_min_distance": 2,
        "outer_restarts": 2,
        "holdout_random_samples": 8,
        # Correlated windows are deterministic, independent of seed. Request
        # all windows; the optimizer removes all training overlaps.
        "holdout_correlated_samples": 48,
        "target_availability": 0.9,
    }
    save("settings.json", settings)
    save("input-normal.json", normal)
    save("input-fixed-failure.json", fixed)
    started = time.perf_counter()
    print(f"OUTPUT {output}", flush=True)

    def progress(evaluated: int, best: dict) -> None:
        robust = best["failure_robust"]
        point = {
            "evaluated": evaluated,
            "elapsed_s": round(time.perf_counter() - started, 2),
            "bank_size": robust["bank_size"],
            "cvar_percent": 100 * robust["cvar_availability"],
            "worst_percent": 100 * robust["worst_availability"],
            "normal_percent": 100 * robust["normal_worst_availability"],
        }
        with (output / "progress.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(point) + "\n")
        if evaluated == 1 or evaluated % 5 == 0:
            print(json.dumps(point), flush=True)

    result = run_optimization(
        {"01_full_constellation": normal, "03_satellite_outages": fixed},
        progress=progress,
        **settings,
    )
    save("result.json", result)
    print("Optimization complete; validating full-day fixed scenario", flush=True)
    full_day = {}
    profiles = {"normal": normal, "fixed_failure": fixed}
    for label in ("baseline", "best"):
        full_day[label] = evaluate_configuration(
            profiles,
            result[label]["parameters"],
            "minimum_hops",
            baseline_parameters=plane_parameters(normal),
            bypass_cache=True,
        )
    save("full-day-comparison.json", full_day)
    save("optimized-normal.json", result["derived_scenario"])
    save(
        "optimized-fixed-failure.json",
        apply_plane_parameters(fixed, result["best"]["parameters"]),
    )
    holdout = result["holdout_validation"]
    summary = {
        "runtime_s": time.perf_counter() - started,
        "evaluated": result["evaluated"],
        "bank_kinds": dict(Counter(case["kind"] for case in result["failure_bank"])),
        "holdout_kinds": dict(Counter(case["kind"] for case in holdout["cases"])),
        "baseline": result["baseline"]["failure_robust"],
        "best": result["best"]["failure_robust"],
        "holdout": holdout,
        "rounds": result["optimization_rounds"],
        "parameters": result["best"]["parameters"],
        "full_day": full_day,
    }
    save("summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
