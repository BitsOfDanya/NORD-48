from __future__ import annotations

import copy
from typing import Any

from app.calculation.optimization.configuration import (
    EvaluationCache,
    apply_plane_parameters,
    candidate_rank_key,
    canonical_parameters,
    evaluate_configuration,
    normalize_angle,
    plane_parameters,
)
from app.calculation.optimization.search import optimize
from app.services.scenario_service import get_example


def test_angle_normalization_and_candidate_does_not_mutate_baseline() -> None:
    scenario = get_example("01_full_constellation")
    original = copy.deepcopy(scenario)
    candidate = apply_plane_parameters(
        scenario, {"P2.raan_deg": 367.5, "P3.phase_deg": -10.0}
    )
    assert scenario == original
    assert plane_parameters(candidate)["P2.raan_deg"] == 7.5
    assert plane_parameters(candidate)["P3.phase_deg"] == 350.0
    assert normalize_angle(720.0) == 0.0


def test_cache_key_is_canonical_and_stress_sensitive() -> None:
    scenario = get_example("01_full_constellation")
    cache = EvaluationCache()
    scenarios = {"normal": scenario}
    first = cache.key(scenarios, {"P2.raan_deg": 360.0}, "minimum_hops")
    second = cache.key(scenarios, {"P2.raan_deg": 0.0}, "minimum_hops")
    assert first == second
    assert canonical_parameters({"b": 1.0, "a": 2.0}) == (("a", 2.0), ("b", 1.0))


def test_identical_candidate_matches_baseline_and_cache_hits() -> None:
    scenario = get_example("01_full_constellation")
    parameters = plane_parameters(scenario)
    cache = EvaluationCache()
    first = evaluate_configuration(
        {"normal": scenario}, parameters, "minimum_hops", cache=cache
    )
    second = evaluate_configuration(
        {"normal": scenario}, parameters, "minimum_hops", cache=cache
    )
    assert first == second
    assert [c["availability_percent"] for c in first["scenarios"][0]["clients"]] == [
        96.66666666666667,
        98.75,
        98.88888888888889,
    ]
    assert (cache.hits, cache.misses) == (1, 1)


def _toy_result(parameters: dict[str, float]) -> dict[str, Any]:
    distance = abs(parameters["P2.raan_deg"] - 75.0)
    availability = 1.0 - distance / 100.0
    return {
        "parameters": dict(parameters),
        "aggregates": {
            "worst_availability": availability,
            "worst_max_outage_s": round(distance),
            "mean_availability": availability,
            "mean_max_outage_s": distance,
            "route_churn": round(distance),
            "parameter_deviation_deg": distance,
            "target_violations": int(availability < 0.9),
            "target_feasible": availability >= 0.9,
        },
    }


def test_objective_tie_break_and_target_status() -> None:
    better_outage = _toy_result({"P2.raan_deg": 75.0})
    worse = copy.deepcopy(better_outage)
    worse["aggregates"]["worst_max_outage_s"] = 10
    assert candidate_rank_key(better_outage) < candidate_rank_key(worse)
    assert better_outage["aggregates"]["target_feasible"] is True


def test_seed_bounds_sorting_revalidation_and_toy_improvement() -> None:
    calls: list[bool] = []

    def evaluator(parameters: dict[str, float], bypass: bool) -> dict[str, Any]:
        calls.append(bypass)
        return _toy_result(parameters)

    kwargs = {
        "baseline_parameters": {"P2.raan_deg": 0.0},
        "variable_names": ["P2.raan_deg"],
        "bounds": {"P2.raan_deg": (50.0, 100.0)},
        "budget": 20,
        "seed": 42,
        "algorithm": "random",
        "initial_exploration_size": 4,
        "stop_on_target": False,
        "evaluator": evaluator,
    }
    first = optimize(**kwargs)
    calls.clear()
    second = optimize(**kwargs)
    assert first["best"]["parameters"] == second["best"]["parameters"]
    assert first["evaluated"] == 20
    assert first["best"]["aggregates"]["worst_availability"] > 0.25
    assert all(50 <= row["parameters"]["P2.raan_deg"] <= 100 for row in first["dataset"][1:])
    assert first["top_candidates"] == sorted(first["top_candidates"], key=candidate_rank_key)
    assert sum(calls) == 5
