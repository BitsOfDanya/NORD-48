"""Resilience endpoints: Monte Carlo stress-testing.

Errors (`ScenarioNotFoundError`, `InvalidScenarioError`) are translated to
HTTP responses by the global handlers in `app.main`.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from app.calculation.resilience.monte_carlo import (
    MAX_ITERATIONS,
    ClientStrategyStats,
    MonteCarloResult,
    StrategySummary,
    TrialDetail,
)
from app.services import (
    failure_degradation_service,
    resilience_service,
    scenario_service,
    simulation_service,
)

router = APIRouter(tags=["resilience"])

RoutingStrategy = Literal["minimum_hops", "minimum_distance", "maximum_margin"]
AnalysisStrategy = Literal[
    "minimum_hops", "minimum_distance", "maximum_margin", "maximum_persistence"
]
ALL_STRATEGIES: list[RoutingStrategy] = ["minimum_hops", "minimum_distance", "maximum_margin"]
ALL_ANALYSIS_STRATEGIES: list[AnalysisStrategy] = [
    "minimum_hops",
    "minimum_distance",
    "maximum_margin",
    "maximum_persistence",
]


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


class RoutingAnalysisRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    strategies: list[AnalysisStrategy] = Field(
        default_factory=lambda: list(ALL_ANALYSIS_STRATEGIES)
    )

    @field_validator("strategies")
    @classmethod
    def _non_empty_analysis_strategies(
        cls, value: list[AnalysisStrategy]
    ) -> list[AnalysisStrategy]:
        if not value:
            raise ValueError("strategies must not be empty")
        return value


class FailureAnalysisRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    satellite_ids: list[str]
    failure_start_s: int = Field(ge=0)
    failure_end_s: int = Field(gt=0)
    routing_strategy: AnalysisStrategy = "minimum_hops"


class N1CriticalityRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    analysis_start_s: int = Field(default=0, ge=0)
    analysis_end_s: int | None = Field(default=None, gt=0)
    routing_strategy: AnalysisStrategy = "minimum_hops"


class N2ThresholdRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    analysis_start_s: int = Field(default=0, ge=0)
    analysis_end_s: int | None = Field(default=None, gt=0)
    routing_strategy: AnalysisStrategy = "minimum_hops"


class RedundancyRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    routing_strategy: AnalysisStrategy = "minimum_hops"


class ConnectivitySourceRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    run_id: str | None = None
    client_id: str

    @model_validator(mode="after")
    def _exactly_one_source(self) -> ConnectivitySourceRequest:
        supplied = sum(
            value is not None for value in (self.scenario_id, self.scenario, self.run_id)
        )
        if supplied != 1:
            raise ValueError("exactly one of scenario_id, scenario, or run_id is required")
        return self


class ConnectivityMarginRequest(ConnectivitySourceRequest):
    timestamp: float = Field(ge=0)


class DailyConnectivityRequest(ConnectivitySourceRequest):
    pass


def _resolve_scenario(
    scenario_id: str | None, scenario: dict[str, Any] | None
) -> dict[str, Any]:
    if scenario_id:
        return scenario_service.get_example(scenario_id)
    if scenario:
        return scenario_service.parse_and_validate(scenario)
    raise HTTPException(status_code=422, detail="scenario_id or scenario is required")


def _resolve_connectivity_scenario(payload: ConnectivitySourceRequest) -> dict[str, Any]:
    if payload.run_id:
        return simulation_service.get_run(payload.run_id).scenario
    return _resolve_scenario(payload.scenario_id, payload.scenario)


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
        "median_worst_client_availability": summary.median_worst_client_availability,
        "p05_worst_client_availability": summary.p05_worst_client_availability,
        "p10_worst_client_availability": summary.p10_worst_client_availability,
        "min_worst_client_availability": summary.min_worst_client_availability,
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


@router.post("/routing-analysis")
async def run_deterministic_routing_analysis(
    payload: RoutingAnalysisRequest,
) -> dict[str, Any]:
    if payload.scenario_id:
        scenario = scenario_service.get_example(payload.scenario_id)
    elif payload.scenario:
        scenario = scenario_service.parse_and_validate(payload.scenario)
    else:
        raise HTTPException(status_code=422, detail="scenario_id or scenario is required")
    return resilience_service.analyze_routing(scenario, list(payload.strategies))


@router.post("/failure-analysis")
async def run_failure_experiment(payload: FailureAnalysisRequest) -> dict[str, Any]:
    scenario = _resolve_scenario(payload.scenario_id, payload.scenario)
    try:
        return resilience_service.analyze_failure(
            scenario,
            payload.satellite_ids,
            payload.failure_start_s,
            payload.failure_end_s,
            payload.routing_strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/criticality/n1")
async def run_n1_experiment(payload: N1CriticalityRequest) -> dict[str, Any]:
    scenario = _resolve_scenario(payload.scenario_id, payload.scenario)
    end_s = payload.analysis_end_s or scenario["environment"]["horizon_s"]
    try:
        return resilience_service.analyze_n1(
            scenario,
            payload.analysis_start_s,
            end_s,
            payload.routing_strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/failure-threshold/n2")
async def run_n2_experiment(payload: N2ThresholdRequest) -> dict[str, Any]:
    scenario = _resolve_scenario(payload.scenario_id, payload.scenario)
    end_s = payload.analysis_end_s or scenario["environment"]["horizon_s"]
    try:
        return resilience_service.analyze_n2(
            scenario,
            payload.analysis_start_s,
            end_s,
            payload.routing_strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/redundancy")
async def run_redundancy_experiment(payload: RedundancyRequest) -> dict[str, Any]:
    scenario = _resolve_scenario(payload.scenario_id, payload.scenario)
    return resilience_service.analyze_redundancy(scenario, payload.routing_strategy)


@router.post("/connectivity-margin")
async def get_connectivity_margin(
    payload: ConnectivityMarginRequest,
) -> dict[str, Any]:
    scenario = _resolve_connectivity_scenario(payload)
    try:
        return resilience_service.analyze_connectivity_margin(
            scenario, payload.client_id, payload.timestamp
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/connectivity-margin/daily")
async def get_daily_connectivity(
    payload: DailyConnectivityRequest,
) -> dict[str, Any]:
    scenario = _resolve_connectivity_scenario(payload)
    try:
        return resilience_service.analyze_daily_connectivity(
            scenario, payload.client_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class FailureDegradationRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    routing_strategy: AnalysisStrategy = "minimum_hops"
    k_values: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6, 8, 10])
    iterations: int = Field(default=100, ge=1, le=MAX_ITERATIONS)
    seed: int = 42

    @field_validator("k_values")
    @classmethod
    def _valid_k_values(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("k_values must not be empty")
        if any(k < 0 for k in value):
            raise ValueError("k_values must be >= 0")
        return value


@router.post("/failure-degradation/run", status_code=202)
async def create_failure_degradation_job(payload: FailureDegradationRequest) -> dict[str, Any]:
    scenario = _resolve_scenario(payload.scenario_id, payload.scenario)
    max_k = max(payload.k_values)
    if max_k >= len(scenario["design"]["satellites"]):
        raise HTTPException(
            status_code=422, detail="k_values must be smaller than the satellite count"
        )
    run_id = failure_degradation_service.create_job(
        {
            "scenario": scenario,
            "k_values": payload.k_values,
            "iterations": payload.iterations,
            "seed": payload.seed,
            "routing_strategy": payload.routing_strategy,
        }
    )
    return {"run_id": run_id, "status": "queued", "evaluated": 0, "total": len(set(payload.k_values))}


@router.get("/failure-degradation/{run_id}")
async def get_failure_degradation_status(run_id: str) -> dict[str, Any]:
    job = failure_degradation_service.get_job(run_id)
    if job is None:
        raise HTTPException(status_code=404, detail="failure degradation run not found")
    return {k: v for k, v in job.items() if k != "result"}


@router.get("/failure-degradation/{run_id}/result")
async def get_failure_degradation_result(run_id: str) -> dict[str, Any]:
    job = failure_degradation_service.get_job(run_id)
    if job is None:
        raise HTTPException(status_code=404, detail="failure degradation run not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"run is {job['status']}, not completed")
    return job["result"]
