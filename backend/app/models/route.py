"""In-memory domain representation of one client's route at one instant."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RouteRecord:
    t_s: float
    client_id: str
    gateway_id: str | None
    strategy: str
    path: list[str] = field(default_factory=list)
    hops: int = 0
    total_distance_km: float | None = None
    bottleneck_margin: float | None = None
    bottleneck_edge: tuple[str, str] | None = None
    visible: bool = False
    diagnostic_reason: str | None = None
    diagnostic_checks: dict[str, bool] | None = None

    @property
    def available(self) -> bool:
        return bool(self.path)
