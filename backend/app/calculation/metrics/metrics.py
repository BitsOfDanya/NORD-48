"""Per-client resilience metrics computed from a simulation timeline.

Definitions:

- `visibility` — client has at least one active, elevation-visible
  satellite contact, regardless of whether a full route to a gateway
  exists.
- `availability` — a full `client -> satellites -> gateway` route exists.
- `max_outage_s` — the longest consecutive run of steps without a route,
  in seconds (`run_length * step_s`).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ClientMetrics:
    client_id: str
    visibility_fraction: float
    visibility_percent: float
    availability_fraction: float
    availability_percent: float
    target_availability: float
    target_achieved: bool
    max_outage_s: int
    outage_count: int
    average_hops: float | None
    route_change_count: int
    average_route_distance_km: float | None


def compute_client_metrics(
    client_id: str,
    visible_flags: list[bool],
    available_flags: list[bool],
    hops: list[int | None],
    distances: list[float | None],
    paths: list[tuple[str, ...]],
    step_s: int,
    target_availability: float,
) -> ClientMetrics:
    n = len(available_flags)
    visibility_fraction = sum(visible_flags) / n
    availability_fraction = sum(available_flags) / n

    max_outage_run = 0
    current_run = 0
    outage_count = 0
    previous_available = True
    for available in available_flags:
        if available:
            current_run = 0
        else:
            current_run += 1
            max_outage_run = max(max_outage_run, current_run)
            if previous_available:
                outage_count += 1
        previous_available = available
    max_outage_s = max_outage_run * step_s

    available_hops = [h for h, avail in zip(hops, available_flags, strict=True) if avail and h is not None]
    average_hops = sum(available_hops) / len(available_hops) if available_hops else None

    available_distances = [
        d for d, avail in zip(distances, available_flags, strict=True) if avail and d is not None
    ]
    average_route_distance_km = (
        sum(available_distances) / len(available_distances) if available_distances else None
    )

    route_change_count = sum(1 for i in range(1, n) if paths[i] != paths[i - 1])

    return ClientMetrics(
        client_id=client_id,
        visibility_fraction=visibility_fraction,
        visibility_percent=visibility_fraction * 100,
        availability_fraction=availability_fraction,
        availability_percent=availability_fraction * 100,
        target_availability=target_availability,
        target_achieved=availability_fraction >= target_availability,
        max_outage_s=max_outage_s,
        outage_count=outage_count,
        average_hops=average_hops,
        route_change_count=route_change_count,
        average_route_distance_km=average_route_distance_km,
    )
