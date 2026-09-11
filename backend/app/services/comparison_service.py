"""Comparison of exact simulation runs on a common time grid."""

from __future__ import annotations

from typing import Any

from app.models.simulation import SimulationRun
from app.services import simulation_service


def _scenario_parameters(run: SimulationRun) -> dict[str, Any]:
    scenario = run.scenario
    return {
        "launch_stage": scenario["design"]["launch_stage"],
        "planes": {
            plane["id"]: {
                "raan_deg": plane["raan_deg"],
                "phase_deg": plane["phase_deg"],
            }
            for plane in scenario["design"]["planes"]
        },
        "isl_range_km": scenario["environment"]["isl_range_km"],
        "min_elevation_deg": scenario["environment"]["min_elevation_deg"],
        "failures": scenario["failures"],
        "gateway_outages": scenario["gateway_outages"],
        "ground_sites": scenario["ground_sites"],
    }


def _metrics(run: SimulationRun) -> dict[str, dict[str, Any]]:
    return {
        client_id: {
            "availability_percent": metric.availability_percent,
            "max_outage_s": metric.max_outage_s,
            "average_hops": metric.average_hops,
            "route_change_count": metric.route_change_count,
            "target_achieved": metric.target_achieved,
        }
        for client_id, metric in run.metrics.items()
    }


def _diff(before: Any, after: Any, path: str = "") -> list[dict[str, Any]]:
    if isinstance(before, dict) and isinstance(after, dict):
        changes: list[dict[str, Any]] = []
        for key in sorted(set(before) | set(after)):
            child_path = f"{path}.{key}" if path else key
            if key not in before:
                changes.append({"path": child_path, "before": None, "after": after[key]})
            elif key not in after:
                changes.append({"path": child_path, "before": before[key], "after": None})
            else:
                changes.extend(_diff(before[key], after[key], child_path))
        return changes
    if before != after:
        return [{"path": path, "before": before, "after": after}]
    return []


def compare_runs(run_ids: list[str]) -> dict[str, Any]:
    runs = [simulation_service.get_run(run_id) for run_id in run_ids]
    baseline = runs[0]
    if any((run.step_s, run.horizon_s) != (baseline.step_s, baseline.horizon_s) for run in runs[1:]):
        raise ValueError("Runs must use the same horizon_s and step_s")

    baseline_parameters = _scenario_parameters(baseline)
    baseline_metrics = _metrics(baseline)
    variants = []
    for run in runs:
        metrics = _metrics(run)
        deltas = {
            client_id: {
                "availability_percent": values["availability_percent"]
                - baseline_metrics.get(client_id, {}).get("availability_percent", 0.0),
                "max_outage_s": values["max_outage_s"]
                - baseline_metrics.get(client_id, {}).get("max_outage_s", 0),
            }
            for client_id, values in metrics.items()
        }
        variants.append(
            {
                "run_id": run.run_id,
                "scenario_id": run.scenario.get("meta", {}).get("id"),
                "scenario_title": run.scenario.get("meta", {}).get("title"),
                "changed_parameters": _diff(baseline_parameters, _scenario_parameters(run)),
                "metrics": metrics,
                "deltas_from_baseline": deltas,
            }
        )

    return {
        "baseline_run_id": baseline.run_id,
        "step_s": baseline.step_s,
        "horizon_s": baseline.horizon_s,
        "variants": variants,
    }
