from __future__ import annotations

import copy

import pytest

from app.calculation.optimization.failure_robust import (
    build_failure_bank,
    failure_cvar_rank_key,
    failure_cvar_scalar,
    lower_tail_cvar,
    run_failure_robust_optimization,
)
from app.services.scenario_service import get_example


def test_lower_tail_cvar_uses_fractional_tail_mass() -> None:
    assert lower_tail_cvar([0.1, 0.2, 0.9, 1.0], 0.25) == pytest.approx(0.1)
    assert lower_tail_cvar([0.1, 0.2, 0.9, 1.0], 0.5) == pytest.approx(0.15)
    assert lower_tail_cvar([0.1, 0.2, 0.9, 1.0], 1.0) == pytest.approx(0.55)
    with pytest.raises(ValueError, match="cvar_alpha"):
        lower_tail_cvar([0.5], 0.0)


def test_failure_bank_is_seeded_unique_and_contains_all_case_kinds() -> None:
    normal = get_example("01_full_constellation")
    fixed = get_example("03_satellite_outages")
    first, start_s, end_s = build_failure_bank(
        normal,
        fixed,
        failure_count=10,
        random_samples=4,
        correlated_samples=3,
        seed=11,
    )
    second, _, _ = build_failure_bank(
        normal,
        fixed,
        failure_count=10,
        random_samples=4,
        correlated_samples=3,
        seed=11,
    )

    assert first == second
    assert start_s == 21600
    assert end_s == 86400
    assert {case.kind for case in first} == {"fixed", "random", "correlated"}
    assert len({case.satellite_ids for case in first}) == len(first)
    assert all(len(case.satellite_ids) == 10 for case in first)


def _candidate(normal: float, cvar: float, worst: float) -> dict:
    clients = [{"availability": normal}]
    return {
        "parameters": {"P2.raan_deg": 0.0},
        "scenarios": [{"clients": clients}],
        "aggregates": {
            "worst_max_outage_s": 100,
            "parameter_deviation_deg": 0.0,
        },
        "failure_robust": {
            "cvar_availability": cvar,
            "worst_availability": worst,
            "normal_worst_availability": normal,
        },
    }


def test_failure_cvar_constraint_and_ranking() -> None:
    infeasible = _candidate(0.89, 0.99, 0.99)
    feasible = _candidate(0.91, 0.50, 0.40)
    better_cvar = copy.deepcopy(feasible)
    better_cvar["failure_robust"]["cvar_availability"] = 0.60

    assert failure_cvar_scalar(feasible, 0.9) < failure_cvar_scalar(infeasible, 0.9)
    assert failure_cvar_rank_key(better_cvar, 0.9) < failure_cvar_rank_key(feasible, 0.9)


def test_short_horizon_multirestart_adversarial_and_holdout() -> None:
    normal = copy.deepcopy(get_example("01_full_constellation"))
    fixed = copy.deepcopy(get_example("03_satellite_outages"))
    for scenario in (normal, fixed):
        scenario["environment"]["horizon_s"] = 2400
    normal["failures"] = []
    for failure in fixed["failures"]:
        failure["start_s"] = 600
        failure["end_s"] = 2400

    result = run_failure_robust_optimization(
        normal,
        fixed,
        ["P2.raan_deg"],
        {"P2.raan_deg": (0.0, 360.0)},
        "minimum_hops",
        10,
        5,
        "toroidal_differential_evolution",
        0,
        False,
        failure_count=10,
        random_samples=1,
        correlated_samples=1,
        cvar_alpha=0.1,
        adversarial_rounds=1,
        adversarial_search_budget=6,
        adversarial_cases_per_round=2,
        adversarial_min_distance=1,
        outer_restarts=2,
        holdout_random_samples=1,
        holdout_correlated_samples=1,
        target_availability=0.9,
    )

    assert result["evaluated"] == 40
    assert result["outer_restarts"] == 2
    assert len(result["optimization_rounds"]) == 2
    assert result["optimization_rounds"][0]["adversarial_cases_added"] == 2
    assert len(result["failure_bank"]) == 5
    assert result["holdout_validation"] is not None
    assert result["holdout_validation"]["bank_size"] >= 1
