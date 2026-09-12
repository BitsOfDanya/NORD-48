"""Exact-equivalence check for `precomputed_evaluator` against the
canonical `build_graph_timeline` / full metrics pipeline.

This is a correctness gate, not a regular unit test: if this file does not
pass, `precomputed_evaluator` must not be used anywhere (see its module
docstring and docs/robust-design-search.md) — approximate-but-fast is not
an acceptable substitute for exact.
"""

from __future__ import annotations

import copy
import random
from typing import Any

import networkx as nx
import pytest

from app.calculation.optimization.precomputed_evaluator import (
    graph_timeline_from_precomputed,
    precompute_snapshots,
)
from app.calculation.resilience.failure_analysis import (
    _client_metrics,
    build_graph_timeline,
    compute_timeline,
)
from app.services.scenario_service import get_example

EXAMPLES = ["01_full_constellation", "02_first_launch", "03_satellite_outages", "04_link_range"]


def _graphs_equal(a: nx.Graph, b: nx.Graph, *, tol: float = 1e-9) -> None:
    assert set(a.nodes) == set(b.nodes)
    assert set(map(frozenset, a.edges)) == set(map(frozenset, b.edges))
    for u, v, data in a.edges(data=True):
        other = b.edges[u, v]
        assert abs(data["distance_km"] - other["distance_km"]) < tol
        assert abs(data["margin"] - other["margin"]) < tol
    for node, data in a.nodes(data=True):
        assert data == b.nodes[node]


def _perturb_planes(scenario: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    derived = copy.deepcopy(scenario)
    for plane in derived["design"]["planes"]:
        plane["raan_deg"] = rng.uniform(0, 360)
        plane["phase_deg"] = rng.uniform(0, 360)
    return derived


def _random_failures(scenario: dict[str, Any], rng: random.Random, count: int) -> dict[str, Any]:
    derived = copy.deepcopy(scenario)
    horizon_s = derived["environment"]["horizon_s"]
    step_s = derived["environment"]["step_s"]
    sat_ids = [s["id"] for s in derived["design"]["satellites"]]
    chosen = rng.sample(sat_ids, min(count, len(sat_ids)))
    failures = []
    for sid in chosen:
        start = rng.randrange(0, horizon_s - step_s, step_s)
        end = rng.randrange(start + step_s, horizon_s + 1, step_s)
        failures.append({"satellite_id": sid, "start_s": start, "end_s": end})
    derived["failures"] = failures
    return derived


def _assert_scenario_equivalent(scenario: dict[str, Any]) -> None:
    canonical_graphs = build_graph_timeline(scenario)
    precomputed = precompute_snapshots(scenario)
    fast_graphs = graph_timeline_from_precomputed(precomputed, scenario)
    assert len(canonical_graphs) == len(fast_graphs)
    for canonical, fast in zip(canonical_graphs, fast_graphs, strict=True):
        _graphs_equal(canonical, fast)


@pytest.mark.parametrize("example_id", EXAMPLES)
def test_matches_canonical_on_bundled_examples(example_id: str) -> None:
    _assert_scenario_equivalent(get_example(example_id))


@pytest.mark.parametrize("seed", range(10))
def test_matches_canonical_with_random_raan_phase(seed: int) -> None:
    rng = random.Random(seed)
    base = get_example("01_full_constellation")
    _assert_scenario_equivalent(_perturb_planes(base, rng))


@pytest.mark.parametrize("seed", range(10))
def test_matches_canonical_with_random_failures(seed: int) -> None:
    rng = random.Random(1000 + seed)
    base = get_example("01_full_constellation")
    scenario = _perturb_planes(base, rng)
    scenario = _random_failures(scenario, rng, count=rng.randint(1, 15))
    _assert_scenario_equivalent(scenario)


@pytest.mark.parametrize("isl_range_km", [500.0, 1200.0, 1800.0, 2000.0, 2500.0, 3000.0, 4500.0])
def test_matches_canonical_across_isl_ranges(isl_range_km: float) -> None:
    scenario = copy.deepcopy(get_example("01_full_constellation"))
    scenario["environment"]["isl_range_km"] = isl_range_km
    _assert_scenario_equivalent(scenario)


@pytest.mark.parametrize("launch_stage", [1, 2, 3])
def test_matches_canonical_across_launch_stages(launch_stage: int) -> None:
    scenario = copy.deepcopy(get_example("01_full_constellation"))
    scenario["design"]["launch_stage"] = launch_stage
    _assert_scenario_equivalent(scenario)


def test_matches_canonical_with_gateway_outage() -> None:
    scenario = copy.deepcopy(get_example("01_full_constellation"))
    gateway_id = next(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")
    scenario["gateway_outages"] = [
        {"gateway_id": gateway_id, "start_s": 3600, "end_s": 10800}
    ]
    _assert_scenario_equivalent(scenario)


@pytest.mark.parametrize("example_id", EXAMPLES)
def test_full_client_metrics_match_exactly(example_id: str) -> None:
    """End-to-end: routing + `_client_metrics` on both graph timelines must
    produce byte-identical availability/outage/route-change numbers — not
    just matching graphs. This is what actually gets returned to callers."""
    scenario = get_example(example_id)
    canonical_graphs = build_graph_timeline(scenario)
    fast_graphs = graph_timeline_from_precomputed(precompute_snapshots(scenario), scenario)

    for strategy in ("minimum_hops", "minimum_distance", "maximum_margin", "maximum_persistence"):
        canonical_timeline = compute_timeline(scenario, canonical_graphs, strategy)
        fast_timeline = compute_timeline(scenario, fast_graphs, strategy)
        assert set(canonical_timeline) == set(fast_timeline)
        for client_id in canonical_timeline:
            canonical_metrics = _client_metrics(scenario, client_id, canonical_timeline[client_id])
            fast_metrics = _client_metrics(scenario, client_id, fast_timeline[client_id])
            assert canonical_metrics == fast_metrics
