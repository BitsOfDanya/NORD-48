"""Comparison of completed exact simulation runs on a common time grid.

Runs are compared, not scenarios or raw variants — each run already carries
its own scenario, routing strategy, and computed metrics
(`simulation_service.get_run`). Deltas are always relative to one explicit
baseline run (the first of `run_ids` unless the caller names one), never to
an implicit "best" run.

Only metrics that were actually computed for a run are reported — no
resilience section, since Monte Carlo/N-1/N-2 results are not cached per
run (see `docs/design-decision.md`): showing zeros for analyses nobody ran
would be a fabricated "0%", not an honest "not run".
"""

from __future__ import annotations

from statistics import fmean
from typing import Any

from app.models.simulation import SimulationRun
from app.services import simulation_service


def _scenario_parameters(run: SimulationRun) -> dict[str, Any]:
    scenario = run.scenario
    return {
        "routing_strategy": run.routing_strategy,
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
        "failures": scenario.get("failures", []),
        "gateway_outages": scenario.get("gateway_outages", []),
        "ground_sites": scenario["ground_sites"],
    }


def _bottleneck_stats(run: SimulationRun, client_id: str) -> dict[str, float | None]:
    margins = sorted(
        record.bottleneck_margin
        for record in run.timeline.get(client_id, [])
        if record.available and record.bottleneck_margin is not None
    )
    if not margins:
        return {"mean_bottleneck_margin": None, "p05_bottleneck_margin": None}
    p05_index = max(0, int(len(margins) * 0.05) - 1) if len(margins) > 1 else 0
    return {
        "mean_bottleneck_margin": fmean(margins),
        "p05_bottleneck_margin": margins[p05_index],
    }


def _metrics(run: SimulationRun) -> dict[str, dict[str, Any]]:
    return {
        client_id: {
            "availability_percent": metric.availability_percent,
            "max_outage_s": metric.max_outage_s,
            "average_hops": metric.average_hops,
            "route_change_count": metric.route_change_count,
            "target_achieved": metric.target_achieved,
            **_bottleneck_stats(run, client_id),
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


def compare_runs(run_ids: list[str], baseline_run_id: str | None = None) -> dict[str, Any]:
    runs = [simulation_service.get_run(run_id) for run_id in run_ids]
    baseline = next((r for r in runs if r.run_id == baseline_run_id), runs[0])
    if any((run.step_s, run.horizon_s) != (baseline.step_s, baseline.horizon_s) for run in runs):
        raise ValueError("Runs must use the same horizon_s and step_s to be comparable")

    baseline_parameters = _scenario_parameters(baseline)
    baseline_metrics = _metrics(baseline)
    baseline_worst = min(m["availability_percent"] for m in baseline_metrics.values())

    variants = []
    for run in runs:
        metrics = _metrics(run)
        worst_availability_percent = min(m["availability_percent"] for m in metrics.values())
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
                "is_baseline": run.run_id == baseline.run_id,
                "changed_parameters": _diff(baseline_parameters, _scenario_parameters(run)),
                "metrics": metrics,
                "worst_availability_percent": worst_availability_percent,
                "worst_availability_delta_pp": worst_availability_percent - baseline_worst,
                "target_status": f"{sum(m['target_achieved'] for m in metrics.values())} / {len(metrics)}",
                "deltas_from_baseline": deltas,
            }
        )

    return {
        "baseline_run_id": baseline.run_id,
        "step_s": baseline.step_s,
        "horizon_s": baseline.horizon_s,
        "variants": variants,
    }
