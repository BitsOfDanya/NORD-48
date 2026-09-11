"""Deterministic comparison of routing strategies on the scenario timeline."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from app.calculation.routing.stability import compute_route_strategy_metrics
from app.services import simulation_service

STRATEGIES = [
    "minimum_hops",
    "minimum_distance",
    "maximum_margin",
    "maximum_persistence",
]
STRATEGY_LABELS = {
    "minimum_hops": "Минимум переходов",
    "minimum_distance": "Минимальная длина",
    "maximum_margin": "Максимальный запас",
    "maximum_persistence": "Максимальная стабильность",
}


def _value(value: float | None, *, fallback: float) -> float:
    return fallback if value is None else value


def run_routing_analysis(
    scenario: dict[str, Any], strategies: list[str] | None = None
) -> dict[str, Any]:
    selected = strategies or STRATEGIES
    rows: list[dict[str, Any]] = []
    for strategy in selected:
        run = simulation_service.run_simulation(scenario, strategy)
        for client_id in run.client_ids:
            metrics = compute_route_strategy_metrics(
                client_id, run.timeline[client_id], run.step_s, run.horizon_s
            )
            rows.append({"strategy": strategy, **asdict(metrics)})

    grouped = {
        strategy: [row for row in rows if row["strategy"] == strategy]
        for strategy in selected
    }

    def ranking(strategy: str) -> tuple[float, float, float, float, float]:
        items = grouped[strategy]
        count = len(items)
        return (
            sum(float(item["availability"]) for item in items) / count,
            sum(_value(item["median_route_lifetime_s"], fallback=0.0) for item in items)
            / count,
            sum(_value(item["p05_bottleneck_margin"], fallback=-1.0) for item in items)
            / count,
            -sum(float(item["route_change_count"]) for item in items) / count,
            -sum(_value(item["mean_hops"], fallback=float("inf")) for item in items)
            / count,
        )

    recommended = max(selected, key=ranking)
    winning = ranking(recommended)
    other_strategies = [strategy for strategy in selected if strategy != recommended]
    runner_up = max(other_strategies, key=ranking) if other_strategies else recommended
    other = ranking(runner_up)
    if winning[0] > other[0]:
        deciding = f"доступность выше на {(winning[0] - other[0]) * 100:.2f} п.п."
    elif winning[1] > other[1]:
        deciding = f"средняя медиана жизни выше на {winning[1] - other[1]:.0f} с"
    elif winning[2] > other[2]:
        deciding = (
            f"средний P05 запаса выше на {(winning[2] - other[2]) * 100:.3f} п.п."
        )
    elif winning[3] > other[3]:
        deciding = f"в среднем на {winning[3] - other[3]:.1f} меньше перестроений"
    else:
        deciding = f"среднее число переходов ниже на {winning[4] - other[4]:.2f}"
    reason = (
        f"{STRATEGY_LABELS[recommended]} рекомендована лексикографически: "
        f"средняя доступность {winning[0] * 100:.2f}%, {deciding}. "
        "Порядок критериев: availability, median lifetime, P05 запаса, "
        "перестроения, hops."
    )
    env = scenario["environment"]
    return {
        "scenario_id": scenario.get("meta", {}).get("id"),
        "scenario_title": scenario.get("meta", {}).get("title"),
        "step_s": env["step_s"],
        "horizon_s": env["horizon_s"],
        "n_steps": env["horizon_s"] // env["step_s"],
        "lifetime_sample": "route_segments",
        "strategies": selected,
        "rows": rows,
        "recommended_strategy": recommended,
        "recommended_reason": reason,
    }
