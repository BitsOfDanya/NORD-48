"""Richer, on-demand explanation for ONE already-diagnosed outage instant.

`diagnose()` (diagnostics.py) already returns the reason category and
three coarse booleans — this module adds the numbers an engineer actually
wants next: how many satellites the client can see, how many disconnected
components the contact graph has at this instant, and whether the client
and the candidate gateway are stuck in different ones. No new reason
categories, no new decision tree — the reason string is `diagnose()`'s,
verbatim; this only adds detail behind it.

Deliberately NOT wired into the hot per-step simulation loop
(`compute_timeline`): it rebuilds one snapshot/graph on demand for the one
instant a user actually clicks on, which is cheap (~single-digit
milliseconds for 48 satellites) and keeps the already-tested hot path
untouched.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import networkx as nx

from app.calculation.diagnostics.diagnostics import diagnose
from app.calculation.geometry import adapter as geometry_adapter
from app.calculation.network.graph import build_snapshot_graph


@dataclass
class OutageExplanation:
    client_id: str
    t_s: float
    reason: str
    gateway_id: str | None
    visible_satellite_count: int
    min_elevation_deg: float
    nearest_below_threshold_satellite_id: str | None
    nearest_below_threshold_elevation_deg: float | None
    gateway_contact: bool
    gateway_in_outage: bool
    network_component_count: int
    client_component_size: int | None
    gateway_component_size: int | None
    same_component_as_gateway: bool | None


def explain_outage(
    scenario: dict[str, Any],
    client_id: str,
    gateway_ids: list[str],
    t_s: float,
) -> OutageExplanation:
    env = scenario["environment"]
    ground_ids = {g["id"] for g in scenario["ground_sites"]}
    snapshot = geometry_adapter.get_snapshot(scenario, t_s)
    full_graph = build_snapshot_graph(
        snapshot,
        ground_ids=ground_ids,
        isl_range_km=env["isl_range_km"],
        min_elevation_deg=env["min_elevation_deg"],
    )
    diagnostic = diagnose(full_graph, scenario, client_id, gateway_ids, t_s)
    gateway_id = diagnostic.gateway_id

    visible_satellite_count = (
        full_graph.degree(client_id) if full_graph.has_node(client_id) else 0
    )

    nearest_id: str | None = None
    nearest_elevation: float | None = None
    if diagnostic.reason == "NO_VISIBLE_SATELLITE":
        elevations: dict[str, float] = snapshot["elevation_deg"].get(client_id, {})
        below_threshold = {
            sid: el for sid, el in elevations.items() if el < env["min_elevation_deg"]
        }
        if below_threshold:
            nearest_id = max(below_threshold, key=lambda sid: below_threshold[sid])
            nearest_elevation = below_threshold[nearest_id]

    components = list(nx.connected_components(full_graph))
    client_component = next((c for c in components if client_id in c), None)
    gateway_component = (
        next((c for c in components if gateway_id in c), None) if gateway_id else None
    )

    return OutageExplanation(
        client_id=client_id,
        t_s=t_s,
        reason=diagnostic.reason,
        gateway_id=gateway_id,
        visible_satellite_count=visible_satellite_count,
        min_elevation_deg=env["min_elevation_deg"],
        nearest_below_threshold_satellite_id=nearest_id,
        nearest_below_threshold_elevation_deg=nearest_elevation,
        gateway_contact=diagnostic.checks.get("gateway_contact", False),
        gateway_in_outage=diagnostic.reason == "GATEWAY_OUTAGE",
        network_component_count=len(components),
        client_component_size=len(client_component) if client_component else None,
        gateway_component_size=len(gateway_component) if gateway_component else None,
        same_component_as_gateway=(
            None
            if client_component is None or gateway_component is None
            else client_component is gateway_component
        ),
    )
