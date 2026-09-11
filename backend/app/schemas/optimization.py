"""API contracts for exact constellation optimization."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class OptimizationRequest(BaseModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    robustness_scenario_ids: list[str] = Field(default_factory=list, max_length=4)
    routing_strategy: str = "minimum_hops"
    maxiter: int = Field(default=1, ge=1, le=20)
    popsize: int = Field(default=3, ge=3, le=20)
    seed: int = 48
    pareto_limit: int = Field(default=8, ge=1, le=30)

    @model_validator(mode="after")
    def require_scenario(self) -> OptimizationRequest:
        if not self.scenario_id and not self.scenario:
            raise ValueError("scenario_id or scenario is required")
        if self.routing_strategy not in {
            "minimum_hops",
            "minimum_distance",
            "maximum_margin",
            "maximum_persistence",
        }:
            raise ValueError("unsupported routing_strategy")
        return self
