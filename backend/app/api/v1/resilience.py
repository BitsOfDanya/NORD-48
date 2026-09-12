"""Resilience endpoints: Monte Carlo stress-testing.

Errors (`ScenarioNotFoundError`, `InvalidScenarioError`) are translated to
HTTP responses by the global handlers in `app.main`.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator

from app.calculation.resilience.monte_carlo import (
    MAX_ITERATIONS,
    ClientStrategyStats,
    MonteCarloResult,
    StrategySummary,
    TrialDetail,
)
from app.services import resilience_service, scenario_service, simulation_service

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
    t_s: float = Field(
        ge=0,
        validation_alias=AliasChoices("t_s", "timestamp"),
        description="Seconds from the start of the scenario. 'timestamp' is accepted as an alias.",
    )


class DailyConnectivityRequest(ConnectivitySourceRequest):
    pass


class ConnectivityMarginResponse(BaseModel):
    client_id: str
    t_s: float
    vertex_connectivity: int = Field(
        description=(
            "Minimum number of satellite failures needed to disconnect the client "
            "from all gateways; zero when no route already exists."
        )
    )
    critical_satellites: list[str] = Field(
        description=(
            "One deterministic satellite-only minimum cut. This is not the union "
            "of all possible minimum cuts."
        )
    )


class CriticalSatelliteFrequency(BaseModel):
    satellite_id: str
    critical_samples: int
    critical_fraction: float


class DailyConnectivityBucket(BaseModel):
    day_start_s: int
    day_end_s: int
    samples_evaluated: int
    minimum_vertex_connectivity: int
    mean_vertex_connectivity: float
    average_when_connected: float | None
    no_route_pct: float
    margin_1_pct: float
    margin_2_pct: float
    margin_3_plus_pct: float
    critical_satellites: list[CriticalSatelliteFrequency] = Field(
        description=(
            "Frequency with which a satellite appeared in the one minimum cut "
            "selected at each sample."
        )
    )


class DailyConnectivityResponse(BaseModel):
    client_id: str
    step_s: int
    days: list[DailyConnectivityBucket]


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


@router.post(
    "/connectivity-margin",
    response_model=ConnectivityMarginResponse,
    summary="Satellite vertex connectivity at one timestamp",
)
async def get_connectivity_margin(
    payload: ConnectivityMarginRequest,
) -> dict[str, Any]:
    scenario = _resolve_connectivity_scenario(payload)
    try:
        return resilience_service.analyze_connectivity_margin(
            scenario, payload.client_id, payload.t_s
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/connectivity-margin/daily",
    response_model=DailyConnectivityResponse,
    summary="Daily aggregation of satellite vertex connectivity",
)
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
