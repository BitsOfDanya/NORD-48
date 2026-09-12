"""Domain representation of a simulation run.

The service keeps these objects in a hot in-memory cache and serializes
completed runs to durable storage when ``RUNS_DIR`` is configured.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.calculation.metrics.metrics import ClientMetrics
from app.models.route import RouteRecord


@dataclass
class SimulationRun:
    run_id: str
    scenario: dict[str, Any]
    routing_strategy: str
    step_s: int
    horizon_s: int
    n_steps: int
    client_ids: list[str]
    gateway_ids: list[str]
    metrics: dict[str, ClientMetrics] = field(default_factory=dict)
    timeline: dict[str, list[RouteRecord]] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
