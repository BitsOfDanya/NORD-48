"""Route lifetime and route-segment statistics over known snapshots.

The geometry layer is deliberately not called here.  All functions consume
the contact graphs already produced for the simulation time grid.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean, median

import networkx as nx
import numpy as np

from app.models.route import RouteRecord

Edge = tuple[str, str]


def edge_key(a: str, b: str) -> Edge:
    return (a, b) if a <= b else (b, a)


def compute_edge_expiry_steps(graphs: list[nx.Graph]) -> list[dict[Edge, int]]:
    """For every edge at every step, return its last consecutive present step."""
    result: list[dict[Edge, int]] = [{} for _ in graphs]
    next_expiry: dict[Edge, int] = {}
    next_edges: set[Edge] = set()
    for index in range(len(graphs) - 1, -1, -1):
        current_edges = {edge_key(a, b) for a, b in graphs[index].edges}
        current: dict[Edge, int] = {}
        for edge in current_edges:
            current[edge] = next_expiry[edge] if edge in next_edges else index
        result[index] = current
        next_expiry = current
        next_edges = current_edges
    return result


def attach_edge_expiry(graph: nx.Graph, expiry: dict[Edge, int]) -> None:
    """Attach precomputed persistence to a graph without changing topology."""
    for a, b in graph.edges:
        graph[a][b]["persistence_until_step"] = expiry[edge_key(a, b)]


def route_lifetime_steps(
    path: list[str], graphs: list[nx.Graph], start_step: int
) -> int:
    """Number of grid intervals the exact path remains usable.

    A path valid only in the current snapshot has lifetime one step.  At the
    right boundary, a still-valid path lives until the simulation horizon.
    """
    if len(path) < 2 or not (0 <= start_step < len(graphs)):
        return 0
    valid_steps = 0
    for graph in graphs[start_step:]:
        if all(graph.has_edge(path[i], path[i + 1]) for i in range(len(path) - 1)):
            valid_steps += 1
        else:
            break
    return valid_steps


def annotate_route_lifetimes(
    records: list[RouteRecord],
    graphs: list[nx.Graph],
    expiry_steps: list[dict[Edge, int]],
    step_s: int,
    horizon_s: int,
) -> None:
    """Populate instantaneous lifetime fields on timeline route records."""
    for index, record in enumerate(records):
        if not record.available:
            continue
        last_step = min(
            expiry_steps[index][edge_key(record.path[i], record.path[i + 1])]
            for i in range(len(record.path) - 1)
        )
        lifetime_steps = last_step - index + 1
        record.route_lifetime_steps = lifetime_steps
        record.route_lifetime_s = lifetime_steps * step_s
        record.route_valid_until_s = min(horizon_s, record.t_s + record.route_lifetime_s)


@dataclass(frozen=True)
class RouteSegment:
    path: tuple[str, ...]
    start_s: float
    end_s: float
    lifetime_s: float


def route_segments(records: list[RouteRecord], step_s: int, horizon_s: int) -> list[RouteSegment]:
    """Split the actually selected timeline into non-empty constant-path segments."""
    segments: list[RouteSegment] = []
    start: int | None = None
    current_path: tuple[str, ...] = ()
    for index in range(len(records) + 1):
        path = tuple(records[index].path) if index < len(records) else ()
        if path == current_path:
            continue
        if current_path and start is not None:
            start_s = records[start].t_s
            end_s = records[index].t_s if index < len(records) else horizon_s
            segments.append(RouteSegment(current_path, start_s, end_s, end_s - start_s))
        current_path = path
        start = index if path else None
    return segments


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    return float(np.percentile(values, percentile))


@dataclass(frozen=True)
class RouteStrategyMetrics:
    client_id: str
    mean_route_lifetime_s: float | None
    median_route_lifetime_s: float | None
    p05_route_lifetime_s: float | None
    p95_route_lifetime_s: float | None
    max_route_lifetime_s: float | None
    mean_bottleneck_margin: float | None
    median_bottleneck_margin: float | None
    p05_bottleneck_margin: float | None
    mean_hops: float | None
    route_change_count: int
    route_changes_per_hour: float
    availability: float
    max_outage_s: int


def compute_route_strategy_metrics(
    client_id: str, records: list[RouteRecord], step_s: int, horizon_s: int
) -> RouteStrategyMetrics:
    """Summarize a strategy; lifetime samples are selected route segments."""
    segments = route_segments(records, step_s, horizon_s)
    lifetimes = [segment.lifetime_s for segment in segments]
    margins = [r.bottleneck_margin for r in records if r.available and r.bottleneck_margin is not None]
    hops = [float(r.hops) for r in records if r.available]
    available = [r.available for r in records]

    max_outage_steps = current_outage = 0
    for is_available in available:
        current_outage = 0 if is_available else current_outage + 1
        max_outage_steps = max(max_outage_steps, current_outage)

    changes = max(0, len(segments) - 1)
    hours = horizon_s / 3600
    return RouteStrategyMetrics(
        client_id=client_id,
        mean_route_lifetime_s=mean(lifetimes) if lifetimes else None,
        median_route_lifetime_s=median(lifetimes) if lifetimes else None,
        p05_route_lifetime_s=_percentile(lifetimes, 5),
        p95_route_lifetime_s=_percentile(lifetimes, 95),
        max_route_lifetime_s=max(lifetimes) if lifetimes else None,
        mean_bottleneck_margin=mean(margins) if margins else None,
        median_bottleneck_margin=median(margins) if margins else None,
        p05_bottleneck_margin=_percentile(margins, 5),
        mean_hops=mean(hops) if hops else None,
        route_change_count=changes,
        route_changes_per_hour=changes / hours if hours else 0.0,
        availability=sum(available) / len(available) if available else 0.0,
        max_outage_s=max_outage_steps * step_s,
    )
