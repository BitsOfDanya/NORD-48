from __future__ import annotations

import copy
from typing import Any

import pytest

from app.calculation.optimization.configuration import (
    EvaluationCache,
    apply_plane_parameters,
    candidate_rank_key,
    canonical_parameters,
    constrained_robust_rank_key,
    constrained_robust_scalar,
    degraded_worst_availability,
    evaluate_configuration,
    normal_target_shortfall,
    normalize_angle,
    pareto_frontier,
    plane_parameters,
)
from app.calculation.optimization.search import _circular_delta, _wrap_into_bounds, optimize
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


def test_circular_delta_treats_359_and_1_as_two_degrees_apart() -> None:
    # Raw difference is 358 degrees; the short way around the circle it's 2.
    assert _circular_delta(358.0, 360.0) == pytest.approx(-2.0)
    assert _circular_delta(-358.0, 360.0) == pytest.approx(2.0)


def test_circular_delta_is_a_no_op_away_from_the_seam() -> None:
    assert _circular_delta(30.0, 360.0) == pytest.approx(30.0)
    assert _circular_delta(-30.0, 360.0) == pytest.approx(-30.0)


def test_wrap_into_bounds_handles_overflow_and_negative_angles() -> None:
    assert _wrap_into_bounds(361.0, 0.0, 360.0) == pytest.approx(1.0)
    assert _wrap_into_bounds(-1.0, 0.0, 360.0) == pytest.approx(359.0)
    assert _wrap_into_bounds(180.0, 0.0, 360.0) == pytest.approx(180.0)


def test_toroidal_de_is_seeded_and_wraps_full_circle_bounds() -> None:
    def evaluator(parameters: dict[str, float], _bypass: bool) -> dict[str, Any]:
        # Optimum straddles the 0/360 seam.
        angle = parameters["P2.raan_deg"] % 360.0
        distance = min(abs(angle - 359.0), 360.0 - abs(angle - 359.0))
        availability = max(0.0, 1.0 - distance / 180.0)
        result = _toy_result(parameters)
        result["aggregates"]["worst_availability"] = availability
        result["aggregates"]["mean_availability"] = availability
        return result

    kwargs = {
        "baseline_parameters": {"P2.raan_deg": 1.0},
        "variable_names": ["P2.raan_deg"],
        "bounds": {"P2.raan_deg": (0.0, 360.0)},
        "budget": 24,
        "seed": 9,
        "algorithm": "toroidal_differential_evolution",
        "initial_exploration_size": 0,
        "stop_on_target": False,
        "evaluator": evaluator,
    }
    first = optimize(**kwargs)
    second = optimize(**kwargs)

    assert first["best"]["parameters"] == second["best"]["parameters"]
    assert first["evaluated"] == 24
    assert all(
        0.0 <= candidate["parameters"]["P2.raan_deg"] < 360.0 for candidate in first["dataset"]
    )


def _toy_candidate(
    normal: list[float],
    degraded: list[float] | None = None,
    *,
    parameters: dict[str, float] | None = None,
    outage: int = 100,
    deviation: float = 0.0,
) -> dict[str, Any]:
    """Build an `evaluate_configuration()`-shaped result with a `"normal"`
    profile and, optionally, a `"degraded"` profile — enough for the
    constrained-robust and Pareto helpers, which only read `scenarios` and
    `aggregates`."""

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

    scenarios = [_row("normal", normal)]
    all_availability = list(normal)
    if degraded is not None:
        scenarios.append(_row("degraded", degraded))
        all_availability += degraded

    return {
        "parameters": parameters or {"P2.raan_deg": 0.0},
        "scenarios": scenarios,
        "aggregates": {
            "worst_availability": min(all_availability),
            "mean_availability": sum(all_availability) / len(all_availability),
            "worst_max_outage_s": outage,
            "mean_max_outage_s": outage,
            "route_churn": 0,
            "parameter_deviation_deg": deviation,
            "target_violations": sum(a < 0.9 for a in all_availability),
            "conditions": len(all_availability),
            "target_feasible": all(a >= 0.9 for a in all_availability),
        },
    }


def test_normal_target_shortfall_and_degraded_worst_helpers() -> None:
    infeasible = _toy_candidate([0.85, 0.95], degraded=[0.5, 0.6])
    feasible = _toy_candidate([0.95, 0.92], degraded=[0.5, 0.6])

    assert normal_target_shortfall(infeasible, "normal", 0.9) == pytest.approx(0.05)
    assert normal_target_shortfall(feasible, "normal", 0.9) == 0.0
    assert degraded_worst_availability(feasible, "normal") == 0.5


def test_constrained_robust_scalar_always_prefers_feasible_over_infeasible() -> None:
    infeasible = _toy_candidate([0.85, 0.95], degraded=[0.9, 0.9])  # tiny shortfall
    feasible_but_bad_degraded = _toy_candidate([0.95, 0.92], degraded=[0.1, 0.1])  # terrible degraded

    assert constrained_robust_scalar(infeasible, "normal", 0.9) >= 1.0
    assert constrained_robust_scalar(feasible_but_bad_degraded, "normal", 0.9) < 1.0
    assert constrained_robust_scalar(feasible_but_bad_degraded, "normal", 0.9) < constrained_robust_scalar(
        infeasible, "normal", 0.9
    )


def test_constrained_robust_scalar_orders_feasible_by_degraded_worst() -> None:
    better_degraded = _toy_candidate([0.95, 0.95], degraded=[0.8, 0.85])
    worse_degraded = _toy_candidate([0.95, 0.95], degraded=[0.5, 0.85])

    assert constrained_robust_scalar(better_degraded, "normal", 0.9) < constrained_robust_scalar(
        worse_degraded, "normal", 0.9
    )


def test_constrained_robust_rank_key_tie_break_order() -> None:
    # Both feasible, identical degraded worst (0.7) -> scalar ties; the
    # tie-break must fall through outage -> normal worst -> deviation.
    less_outage = _toy_candidate([0.95, 0.95], degraded=[0.7, 0.9], outage=50, deviation=5.0)
    more_outage = _toy_candidate([0.95, 0.95], degraded=[0.7, 0.9], outage=200, deviation=5.0)
    assert constrained_robust_rank_key(less_outage, "normal", 0.9) < constrained_robust_rank_key(
        more_outage, "normal", 0.9
    )

    higher_normal_worst = _toy_candidate([0.98, 0.97], degraded=[0.7, 0.9], outage=50, deviation=5.0)
    lower_normal_worst = _toy_candidate([0.95, 0.95], degraded=[0.7, 0.9], outage=50, deviation=5.0)
    assert constrained_robust_rank_key(
        higher_normal_worst, "normal", 0.9
    ) < constrained_robust_rank_key(lower_normal_worst, "normal", 0.9)

    less_deviation = _toy_candidate([0.98, 0.95], degraded=[0.7, 0.9], outage=50, deviation=1.0)
    more_deviation = _toy_candidate([0.98, 0.95], degraded=[0.7, 0.9], outage=50, deviation=9.0)
    assert constrained_robust_rank_key(less_deviation, "normal", 0.9) < constrained_robust_rank_key(
        more_deviation, "normal", 0.9
    )


def test_pareto_frontier_keeps_only_nondominated_candidates() -> None:
    dominated = _toy_candidate([0.80, 0.80], outage=500, deviation=10.0)
    dominant = _toy_candidate([0.95, 0.95], outage=100, deviation=1.0)  # beats `dominated` on everything
    tradeoff = _toy_candidate([0.99, 0.99], outage=900, deviation=1.0)  # better availability, worse outage

    frontier = pareto_frontier([dominated, dominant, tradeoff])

    assert dominated not in frontier
    assert dominant in frontier
    assert tradeoff in frontier
    assert len(frontier) == 2
