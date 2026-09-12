"""Exact contact-graph construction that reuses geometry across the three
stress profiles evaluated for one RAAN/phase candidate.

`evaluate_configuration` (see `configuration.py`) calls
`build_graph_timeline` once per profile (normal/outages/ISL2000), and each
of those calls `reference_geometry.snapshot()` from scratch for every one
of the 720 steps — recomputing satellite positions, inter-satellite
distances, and ground elevations three times even though all three depend
only on RAAN/phase/altitude/inclination, which are IDENTICAL across the
three profiles for a given candidate. Only `isl_range_km`, `failures`,
`launch_stage`, and `gateway_outages` differ between profiles, and those
only affect which of the already-computed contacts are *included* — never
the underlying positions or distances.

This module factors that out: `precompute_snapshots()` calls
`reference_geometry.positions()` (unchanged, imported — not reimplemented)
once per step, then reproduces `reference_geometry.snapshot()`'s own
ISL/visibility formulas (same operations, same order) to get raw
pairwise distances and elevations. `graph_timeline_from_precomputed()`
then builds a profile-specific graph timeline from those by applying only
the cheap boolean masks (`active`, distance-threshold, elevation-
threshold) that `snapshot()` itself applies — no orbital math repeated.

`reference_geometry.py` is never modified; `positions()` is called
verbatim so satellite positions are byte-identical to the canonical path.
Exact equivalence with `build_graph_timeline` is verified in
`tests/unit/test_precomputed_evaluator.py` — this module MUST NOT be used
anywhere unless that equivalence check keeps passing (see its docstring).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import networkx as nx
import numpy as np

from app.calculation.geometry import reference_geometry
from app.calculation.network.margins import ground_margin, isl_margin


@dataclass
class PrecomputedSnapshot:
    """Everything at one timestep that depends only on RAAN/phase/altitude/
    inclination — never on `isl_range_km`, `failures`, `launch_stage`, or
    `gateway_outages`."""

    t_s: float
    sat_ids: list[str]
    isl_i: np.ndarray
    isl_j: np.ndarray
    isl_dist: np.ndarray
    ground_ids: list[str]
    ground_elevation_deg: dict[str, np.ndarray]
    ground_distance_km: dict[str, np.ndarray]


def precompute_snapshots(scenario: dict[str, Any]) -> list[PrecomputedSnapshot]:
    """One pass per step, reusable across every profile sharing this
    scenario's `design.planes`/`design.satellites` and `environment`
    orbital fields (altitude/inclination/earth_angle0)."""
    env = scenario["environment"]
    step_s = env["step_s"]
    n_steps = env["horizon_s"] // step_s
    snapshots: list[PrecomputedSnapshot] = []
    ground_sites = scenario["ground_sites"]

    for step in range(n_steps):
        t_s = float(step * step_s)
        ids, _inertial, xyz = reference_geometry.positions(scenario, t_s)
        i, j = np.triu_indices(len(ids), 1)
        delta = xyz[j] - xyz[i]
        dist = np.linalg.norm(delta, axis=1)
        denom = np.sum(delta * delta, axis=1)
        lam = np.clip(-np.sum(xyz[i] * delta, axis=1) / np.maximum(denom, 1e-12), 0, 1)
        closest = np.linalg.norm(xyz[i] + lam[:, None] * delta, axis=1)
        clear = closest > reference_geometry.R

        ground_elevation_deg: dict[str, np.ndarray] = {}
        ground_distance_km: dict[str, np.ndarray] = {}
        for g in ground_sites:
            gp = reference_geometry.ground_position(g)
            dif = xyz - gp
            dl = np.linalg.norm(dif, axis=1)
            el = np.degrees(
                np.arcsin(np.clip(dif @ (gp / reference_geometry.R) / dl, -1, 1))
            )
            ground_elevation_deg[g["id"]] = el
            ground_distance_km[g["id"]] = dl

        snapshots.append(
            PrecomputedSnapshot(
                t_s=t_s,
                sat_ids=ids,
                isl_i=i[clear],
                isl_j=j[clear],
                isl_dist=dist[clear],
                ground_ids=[g["id"] for g in ground_sites],
                ground_elevation_deg=ground_elevation_deg,
                ground_distance_km=ground_distance_km,
            )
        )
    return snapshots


def _build_graph(
    pre: PrecomputedSnapshot,
    *,
    isl_range_km: float,
    min_elevation_deg: float,
    active_mask: np.ndarray,
    gateway_outage_ids: set[str],
) -> nx.Graph:
    graph: nx.Graph = nx.Graph()
    for k, sid in enumerate(pre.sat_ids):
        if active_mask[k]:
            graph.add_node(sid, kind="satellite")

    ok = (
        (pre.isl_dist < isl_range_km)
        & active_mask[pre.isl_i]
        & active_mask[pre.isl_j]
    )
    for a_idx, b_idx, d in zip(pre.isl_i[ok], pre.isl_j[ok], pre.isl_dist[ok], strict=True):
        a, b = pre.sat_ids[a_idx], pre.sat_ids[b_idx]
        graph.add_edge(a, b, distance_km=float(d), margin=isl_margin(float(d), isl_range_km))

    for ground_id in pre.ground_ids:
        if ground_id in gateway_outage_ids:
            continue
        elevation = pre.ground_elevation_deg[ground_id]
        distance = pre.ground_distance_km[ground_id]
        visible = (elevation >= min_elevation_deg) & active_mask
        for k in np.where(visible)[0]:
            sid = pre.sat_ids[k]
            graph.add_edge(
                ground_id,
                sid,
                distance_km=float(distance[k]),
                margin=ground_margin(float(elevation[k]), min_elevation_deg),
            )
    return graph


def graph_timeline_from_precomputed(
    precomputed: list[PrecomputedSnapshot], scenario: dict[str, Any]
) -> list[nx.Graph]:
    """Exact equivalent of
    `app.calculation.resilience.failure_analysis.build_graph_timeline(scenario)`
    — same `isl_range_km`/`failures`/`launch_stage`/`gateway_outages`
    semantics as `reference_geometry.snapshot()`, applied to geometry
    precomputed once for the shared RAAN/phase. `precomputed` must have
    been built from a scenario with the same `design.planes`/
    `design.satellites` and orbital environment fields as `scenario` —
    only `isl_range_km`, `min_elevation_deg`, `failures`, `launch_stage`,
    and `gateway_outages` are allowed to differ."""
    env = scenario["environment"]
    design = scenario["design"]
    isl_range_km = env["isl_range_km"]
    min_elevation_deg = env["min_elevation_deg"]
    launch_stage = design["launch_stage"]
    launch_batch = {sat["id"]: sat["launch_batch"] for sat in design["satellites"]}
    failures = scenario.get("failures", [])
    gateway_outages = scenario.get("gateway_outages", [])

    graphs: list[nx.Graph] = []
    for pre in precomputed:
        t_s = pre.t_s
        failed = {f["satellite_id"] for f in failures if f["start_s"] <= t_s < f["end_s"]}
        active_mask = np.array(
            [launch_batch[sid] <= launch_stage and sid not in failed for sid in pre.sat_ids]
        )
        gateway_outage_ids = {
            outage["gateway_id"]
            for outage in gateway_outages
            if outage["start_s"] <= t_s < outage["end_s"]
        }
        graphs.append(
            _build_graph(
                pre,
                isl_range_km=isl_range_km,
                min_elevation_deg=min_elevation_deg,
                active_mask=active_mask,
                gateway_outage_ids=gateway_outage_ids,
            )
        )
    return graphs
