"""API contracts for comparing completed simulation runs."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class CompareRunsRequest(BaseModel):
    run_ids: list[str] = Field(min_length=2, max_length=10)
    baseline_run_id: str | None = None

    @model_validator(mode="after")
    def baseline_is_one_of_the_runs(self) -> CompareRunsRequest:
        if self.baseline_run_id is not None and self.baseline_run_id not in self.run_ids:
            raise ValueError("baseline_run_id must be one of run_ids")
        return self
