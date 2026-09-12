"""Robust Design Search 2.0 canonical objective — see
docs/robust-design-search.md and `configuration.robust_design_rank_key`.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.calculation.optimization.configuration import (
    degraded_profile_mean_availability,
    degraded_profile_worst_availability,
    robust_design_rank_key,
    robust_design_scalar,
    robust_primary_metric,
    robust_secondary_metric,
)

DEGRADED = ("outages", "isl2000")


def _toy_candidate(
    normal: list[float],
    outages: list[float],
    isl2000: list[float],
    *,
    parameters: dict[str, float] | None = None,
    outage_s: int = 100,
    deviation: float = 0.0,
) -> dict[str, Any]:
    def _row(profile: str, availabilities: list[float]) -> dict[str, Any]:
        clients = [
            {"client_id": f"C{i}", "availability": a, "target_reached": a >= 0.9}
            for i, a in enumerate(availabilities)
        ]
        return {
            "profile": profile,
            "clients": clients,
            "worst_availability": min(availabilities),
            "target_violations": sum(a < 0.9 for a in availabilities),
        }

    scenarios = [_row("normal", normal), _row("outages", outages), _row("isl2000", isl2000)]
    all_availability = normal + outages + isl2000
    return {
        "parameters": parameters or {"P1.raan_deg": 0.0},
        "scenarios": scenarios,
        "aggregates": {
            "worst_availability": min(all_availability),
            "mean_availability": sum(all_availability) / len(all_availability),
            "worst_max_outage_s": outage_s,
            "mean_max_outage_s": outage_s,
            "route_churn": 0,
            "target_violations": sum(a < 0.9 for a in normal),
            "conditions": len(all_availability),
            "target_feasible": all(a >= 0.9 for a in normal),
            "parameter_deviation_deg": deviation,
        },
    }


def test_primary_metric_is_min_of_profile_worsts() -> None:
    candidate = _toy_candidate([0.95, 0.96], outages=[0.7, 0.75], isl2000=[0.6, 0.65])
    assert robust_primary_metric(candidate, DEGRADED) == pytest.approx(0.6)


def test_secondary_metric_is_min_of_profile_means() -> None:
    candidate = _toy_candidate([0.95, 0.96], outages=[0.7, 0.9], isl2000=[0.6, 0.62])
    assert degraded_profile_worst_availability(candidate, "outages") == pytest.approx(0.7)
    assert degraded_profile_mean_availability(candidate, "outages") == pytest.approx(0.8)
    assert degraded_profile_mean_availability(candidate, "isl2000") == pytest.approx(0.61)
    assert robust_secondary_metric(candidate, DEGRADED) == pytest.approx(0.61)


def test_gate1_infeasible_always_scores_worse_than_any_feasible_candidate() -> None:
    infeasible = _toy_candidate([0.85, 0.95], outages=[0.99, 0.99], isl2000=[0.99, 0.99])
    feasible_but_bad_degraded = _toy_candidate([0.95, 0.92], outages=[0.1, 0.1], isl2000=[0.1, 0.1])

    assert robust_design_scalar(infeasible, "normal", DEGRADED, 0.9) >= 1.0
    assert robust_design_scalar(feasible_but_bad_degraded, "normal", DEGRADED, 0.9) < 1.0


def test_primary_orders_feasible_candidates_by_worst_degraded_profile() -> None:
    """Even though `isl2000` looks fine, a candidate whose `outages` worst
    is lower must rank worse — this is the whole point of `min(...)`
    instead of averaging the two profiles together."""
    outages_weak = _toy_candidate([0.95, 0.95], outages=[0.5, 0.8], isl2000=[0.9, 0.9])
    isl_weak = _toy_candidate([0.95, 0.95], outages=[0.9, 0.9], isl2000=[0.5, 0.8])
    balanced = _toy_candidate([0.95, 0.95], outages=[0.65, 0.7], isl2000=[0.65, 0.7])

    key_outages_weak = robust_design_rank_key(outages_weak, "normal", DEGRADED, 0.9)
    key_isl_weak = robust_design_rank_key(isl_weak, "normal", DEGRADED, 0.9)
    key_balanced = robust_design_rank_key(balanced, "normal", DEGRADED, 0.9)

    # Both single-weak-profile candidates share the same primary (0.5) —
    # the balanced candidate (primary 0.65) must rank strictly better than
    # either, confirming "don't let one profile crash while the other
    # looks great" is actually penalized.
    assert key_balanced < key_outages_weak
    assert key_balanced < key_isl_weak


def test_secondary_tie_break_when_primary_ties() -> None:
    """Same worst (0.6) in both, but one has a better mean in its
    weakest profile — must win on the SECONDARY tier."""
    better_mean = _toy_candidate([0.95, 0.95], outages=[0.6, 0.9], isl2000=[0.8, 0.8])
    worse_mean = _toy_candidate([0.95, 0.95], outages=[0.6, 0.61], isl2000=[0.8, 0.8])

    assert robust_primary_metric(better_mean, DEGRADED) == robust_primary_metric(worse_mean, DEGRADED) == pytest.approx(0.6)
    assert robust_design_rank_key(better_mean, "normal", DEGRADED, 0.9) < robust_design_rank_key(
        worse_mean, "normal", DEGRADED, 0.9
    )


def test_third_tier_breaks_ties_on_worst_outage() -> None:
    same_primary_secondary = dict(outages=[0.6, 0.7], isl2000=[0.6, 0.7])
    less_outage = _toy_candidate([0.95, 0.95], outage_s=50, **same_primary_secondary)
    more_outage = _toy_candidate([0.95, 0.95], outage_s=500, **same_primary_secondary)

    assert robust_design_rank_key(less_outage, "normal", DEGRADED, 0.9) < robust_design_rank_key(
        more_outage, "normal", DEGRADED, 0.9
    )


def test_fifth_tier_prefers_less_parameter_deviation_on_full_tie() -> None:
    same = dict(outages=[0.6, 0.7], isl2000=[0.6, 0.7], outage_s=100)
    less_deviation = _toy_candidate([0.95, 0.95], deviation=1.0, **same)
    more_deviation = _toy_candidate([0.95, 0.95], deviation=9.0, **same)

    assert robust_design_rank_key(less_deviation, "normal", DEGRADED, 0.9) < robust_design_rank_key(
        more_deviation, "normal", DEGRADED, 0.9
    )
