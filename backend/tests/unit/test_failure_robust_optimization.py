from __future__ import annotations

import copy

import pytest

from app.calculation.optimization.failure_robust import (
    build_failure_bank,
    failure_cvar_rank_key,
    failure_cvar_scalar,
    lower_tail_cvar,
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
