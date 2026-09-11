"""API contracts for comparing completed simulation runs."""

from pydantic import BaseModel, Field


class CompareRunsRequest(BaseModel):
    run_ids: list[str] = Field(min_length=2, max_length=10)
