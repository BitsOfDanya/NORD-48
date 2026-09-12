"""Cross-validate a failure_cvar search candidate against the standard exact
verification suite: Normal, Outages, ISL2000, N-1, N-2, backup-path mean.

CVaR/random-failure search is used only for ranking during search; before a
candidate can be recommended it must be re-checked with the same exact tools
used everywhere else in the project. This script performs that re-check for
the current Recommended Robust design and for a failure_cvar candidate, side
by side.

Usage: backend/.venv/bin/python scripts/verify_failure_cvar_candidate.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.calculation.optimization.configuration import apply_plane_parameters
from app.calculation.resilience.failure_analysis import run_n1_criticality
from app.calculation.resilience.failure_threshold import run_exact_n2
from app.calculation.resilience.redundancy import run_redundancy_analysis
from app.services.scenario_service import get_example
from app.services.simulation_service import run_simulation

CANDIDATES: dict[str, dict[str, dict[str, float]]] = {
    "Recommended Robust (current)": {
        "P1": {"raan_deg": 104.47125962122719, "phase_deg": 303.7966152991311},
        "P2": {"raan_deg": 226.2918165087214, "phase_deg": 247.99724234679812},
        "P3": {"raan_deg": 159.35288435343463, "phase_deg": 241.55945892515913},
    },
    "Failure-CVaR search candidate": {
        "P1": {"raan_deg": 0.0, "phase_deg": 0.0},
        "P2": {"raan_deg": 231.79144322903923, "phase_deg": 159.6291115778392},
        "P3": {"raan_deg": 296.1941807774988, "phase_deg": 81.80593984251968},
    },
}

PROFILES = {
    "Normal": "01_full_constellation",
    "Outages": "03_satellite_outages",
    "ISL2000": "04_link_range",
}


def apply_planes(scenario: dict[str, Any], planes: dict[str, dict[str, float]]) -> dict[str, Any]:
    params = {}
    for plane_id, angles in planes.items():
        params[f"{plane_id}.raan_deg"] = angles["raan_deg"]
        params[f"{plane_id}.phase_deg"] = angles["phase_deg"]
    return apply_plane_parameters(scenario, params)


def main() -> None:
    results: dict[str, dict[str, Any]] = {}
    for name, planes in CANDIDATES.items():
        print(f"\n=== {name} ===")
        row: dict[str, Any] = {}
        for profile_label, scenario_id in PROFILES.items():
            scenario = apply_planes(get_example(scenario_id), planes)
            run = run_simulation(scenario, "minimum_hops")
            worst = min(m.availability_percent for m in run.metrics.values())
            row[profile_label] = worst
            print(f"{profile_label} worst: {worst:.2f}%")

        normal_scenario = apply_planes(get_example("01_full_constellation"), planes)
        n1 = run_n1_criticality(
            normal_scenario, 0, normal_scenario["environment"]["horizon_s"], "minimum_hops"
        )
        n1_top = n1["ranking"][0] if n1["ranking"] else None
        # N-1 PASS: even the most disruptive single failure causes zero target violations.
        n1_pass = n1_top is None or n1_top["target_violations_count"] == 0
        row["N1_pass"] = n1_pass
        row["N1_worst_client_availability_percent"] = (
            n1_top["worst_client_availability_percent"] if n1_top else None
        )
        print(
            f"N-1 PASS={n1_pass}  worst single-failure disruptor: "
            f"{n1_top['satellite_id'] if n1_top else None} "
            f"worst_avail%={row['N1_worst_client_availability_percent']}"
        )

        n2 = run_exact_n2(
            normal_scenario, 0, normal_scenario["environment"]["horizon_s"], "minimum_hops"
        )
        # N-2 PASS: no satellite pair failure breaks the target for any client.
        n2_pass = not n2["threshold_found"]
        row["N2_pass"] = n2_pass
        row["N2_worst_pair_availability_percent"] = n2["pair_worst_availability_stats"]["min_percent"]
        print(
            f"N-2 PASS={n2_pass}  worst pair availability%="
            f"{row['N2_worst_pair_availability_percent']:.2f}"
        )

        redundancy = run_redundancy_analysis(normal_scenario, "minimum_hops")
        backup_means = [c["backup_path_percent"] for c in redundancy["clients"].values()]
        row["backup_mean"] = sum(backup_means) / len(backup_means)
        print(f"Backup path mean: {row['backup_mean']:.2f}%")

        results[name] = row

    out_path = ROOT / "data/results/failure_robust_consolidation/exact_cross_validation.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False, default=str))
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
