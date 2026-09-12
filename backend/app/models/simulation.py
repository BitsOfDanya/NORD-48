"""In-memory domain representation of a simulation run.

Not persisted — runs live for the lifetime of the backend process in
`app.services.simulation_service`'s module-level store. The structure is
deliberately plain so persistence can be added later without touching
calculation code.
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
