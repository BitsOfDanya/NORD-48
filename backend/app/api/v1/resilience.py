"""Resilience endpoints: Monte Carlo stress-testing.

Errors (`ScenarioNotFoundError`, `InvalidScenarioError`) are translated to
HTTP responses by the global handlers in `app.main`.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.calculation.resilience.monte_carlo import (
    MAX_ITERATIONS,
    ClientStrategyStats,
    MonteCarloResult,
    StrategySummary,
    TrialDetail,
)
from app.services import resilience_service, scenario_service

router = APIRouter(tags=["resilience"])

RoutingStrategy = Literal["minimum_hops", "minimum_distance", "maximum_margin"]
ALL_STRATEGIES: list[RoutingStrategy] = ["minimum_hops", "minimum_distance", "maximum_margin"]


class MonteCarloRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    failed_satellites_count: int = Field(ge=0)
    iterations: int = Field(default=100, ge=1, le=MAX_ITERATIONS)
    seed: int = 42
    strategies: list[RoutingStrategy] = Field(default_factory=lambda: list(ALL_STRATEGIES))
    clients: list[str] | None = None

    @field_validator("strategies")
    @classmethod
    def _non_empty_strategies(cls, value: list[RoutingStrategy]) -> list[RoutingStrategy]:
        if not value:
            raise ValueError("strategies must not be empty")
        return value


def _client_stats_dict(stats: ClientStrategyStats) -> dict[str, Any]:
    return {
        "client_id": stats.client_id,
        "mean": stats.mean,
        "std": stats.std,
        "min": stats.min,
        "max": stats.max,
        "p05": stats.p05,
        "p50": stats.p50,
        "p95": stats.p95,
        "target_success_fraction": stats.target_success_fraction,
        "mean_max_outage_s": stats.mean_max_outage_s,
        "p95_max_outage_s": stats.p95_max_outage_s,
    }


def _strategy_summary_dict(summary: StrategySummary) -> dict[str, Any]:
    return {
        "strategy": summary.strategy,
        "per_client": [_client_stats_dict(s) for s in summary.per_client],
        "mean_worst_client_availability": summary.mean_worst_client_availability,
        "p05_worst_client_availability": summary.p05_worst_client_availability,
        "all_clients_target_fraction": summary.all_clients_target_fraction,
    }


def _trial_detail_dict(trial: TrialDetail) -> dict[str, Any]:
    return {
        "trial_index": trial.trial_index,
        "failed_satellites": trial.failed_satellites,
        "worst_client_id": trial.worst_client_id,
        "worst_client_availability": trial.worst_client_availability,
        "diagnostic_breakdown": trial.diagnostic_breakdown,
    }


def _result_dict(result: MonteCarloResult) -> dict[str, Any]:
    return {
        "scenario_id": result.scenario_id,
        "scenario_title": result.scenario_title,
        "parameters": {
            "failed_satellites_count": result.failed_satellites_count,
            "requested_failed_satellites_count": result.requested_failed_satellites_count,
            "iterations": result.iterations,
            "seed": result.seed,
            "candidate_satellite_count": result.candidate_satellite_count,
        },
        "step_s": result.step_s,
        "horizon_s": result.horizon_s,
        "n_steps": result.n_steps,
        "target_availability": result.target_availability,
        "client_ids": result.client_ids,
        "gateway_ids": result.gateway_ids,
        "strategies": [_strategy_summary_dict(s) for s in result.strategies],
        "recommended_strategy": result.recommended_strategy,
        "recommended_reason": result.recommended_reason,
        "worst_trial": _trial_detail_dict(result.worst_trial) if result.worst_trial else None,
        "best_trial": _trial_detail_dict(result.best_trial) if result.best_trial else None,
    }


@router.post("/monte-carlo")
async def run_monte_carlo_experiment(payload: MonteCarloRequest) -> dict[str, Any]:
    if payload.scenario_id:
        scenario = scenario_service.get_example(payload.scenario_id)
    elif payload.scenario:
        scenario = scenario_service.parse_and_validate(payload.scenario)
    else:
        raise HTTPException(status_code=422, detail="scenario_id or scenario is required")

    result = resilience_service.run_experiment(
        scenario=scenario,
        failed_satellites_count=payload.failed_satellites_count,
        iterations=payload.iterations,
        seed=payload.seed,
        strategies=list(payload.strategies),
        client_ids=payload.clients,
    )
    return _result_dict(result)
