"""Regression coverage for the exact failure class found in a previous
session's deployment-planner work: a subset/exclusion overlay silently
REPLACING a stress profile's own `failures` instead of composing with it,
which made "outages worst" silently equal "normal worst". That bug lived
in `deployment_planner.active_subset_scenario` (a different module,
untouched this session) — these tests instead confirm
`evaluate_configuration`'s own multi-profile path (used by Robust Design
Search 2.0) never had it and does not develop it: `apply_plane_parameters`
only ever touches `design.planes` angles, never `failures`, and the
evaluation cache key is scoped to the full profile set so Normal can never
be silently substituted for Outages/ISL2000.
"""

from __future__ import annotations

import copy

from app.calculation.optimization.configuration import (
    EvaluationCache,
    apply_plane_parameters,
    evaluate_configuration,
)
from app.services.scenario_service import get_example


def test_apply_plane_parameters_never_touches_failures() -> None:
    scenario = get_example("03_satellite_outages")
    original_failures = copy.deepcopy(scenario["failures"])
    assert original_failures  # sanity: this profile actually has failures

    derived = apply_plane_parameters(scenario, {"P2.raan_deg": 45.0})

    assert derived["failures"] == original_failures


def test_outages_profile_result_reflects_its_own_failures_not_normal() -> None:
    """The whole point of a stress profile: outages worst must be strictly
    worse than normal worst for the identical geometry, because
    `03_satellite_outages` has real `failures` and `01_full_constellation`
    has none. If a future change ever made the outages profile's failures
    get silently dropped/overwritten, this would start failing (outages
    worst would jump up to equal normal worst)."""
    normal = get_example("01_full_constellation")
    outages = get_example("03_satellite_outages")
    assert normal["failures"] == []
    assert outages["failures"] != []

    result = evaluate_configuration(
        {"normal": normal, "outages": outages}, {}, "minimum_hops"
    )
    normal_row = next(r for r in result["scenarios"] if r["profile"] == "normal")
    outages_row = next(r for r in result["scenarios"] if r["profile"] == "outages")

    assert outages_row["worst_availability"] < normal_row["worst_availability"]
    assert outages_row["failure_count"] == len(outages["failures"])
    assert normal_row["failure_count"] == 0


def test_cache_key_distinguishes_profile_sets_not_just_parameters() -> None:
    """Same parameters, same routing strategy, but a DIFFERENT profile set
    (one has outages' failures, the other doesn't) must never share a
    cache entry — proves the cache key hashes the full scenario payload,
    not just something coarser like a scenario_id string."""
    normal = get_example("01_full_constellation")
    outages = get_example("03_satellite_outages")
    cache = EvaluationCache()

    result_normal_only = evaluate_configuration(
        {"normal": normal}, {}, "minimum_hops", cache=cache
    )
    result_with_outages = evaluate_configuration(
        {"normal": normal, "outages": outages}, {}, "minimum_hops", cache=cache
    )

    assert cache.misses == 2
    assert cache.hits == 0
    assert result_normal_only["aggregates"]["worst_availability"] != result_with_outages["aggregates"]["worst_availability"]

    # Calling either again now must hit its OWN cache entry, not the other's.
    repeat_normal_only = evaluate_configuration(
        {"normal": normal}, {}, "minimum_hops", cache=cache
    )
    assert cache.hits == 1
    assert repeat_normal_only == result_normal_only
