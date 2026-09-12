"""Deployment sequence planner / minimum-constellation-size tests.

`greedy_sequence` is O(n^2) exact simulations — real enough to be slow at
full scale (n=48), so these tests cap `max_size` at 3 (48+47+46 = 141
evaluations, shared across assertions via a module-scoped fixture) rather
than mocking the pipeline: the whole point of this module is that every
step is an exact simulation, so a test that mocks that away would not be
testing the thing that matters.
"""

from __future__ import annotations

import copy

import pytest

from app.calculation.optimization.configuration import apply_plane_parameters
from app.calculation.optimization.deployment_planner import (
    SubsetEvaluation,
    active_subset_scenario,
    evaluate_subset,
    first_verified_pass,
    greedy_sequence,
    marginal_gain_curve,
    minimum_size_for_target,
    refine_stage,
    refine_subset_local_search,
    swap_refine,
    target_margin_pp,
    verify_threshold,
)
from app.services.scenario_service import get_example

SCENARIO_ID = "01_full_constellation"


@pytest.fixture(scope="module")
def scenario():
    return get_example(SCENARIO_ID)


@pytest.fixture(scope="module")
def small_sequence(scenario):
    return greedy_sequence(scenario, "minimum_hops", max_size=3)


def test_active_subset_scenario_does_not_mutate_source(scenario) -> None:
    original = copy.deepcopy(scenario)
    active_subset_scenario(scenario, {"S01", "S02", "S03"})
    assert scenario == original


def test_active_subset_scenario_fails_out_the_complement(scenario) -> None:
    active_ids = {"S01", "S02", "S03"}
    derived = active_subset_scenario(scenario, active_ids)
    all_ids = {sat["id"] for sat in derived["design"]["satellites"]}
    failed_ids = {f["satellite_id"] for f in derived["failures"]}
    assert failed_ids == all_ids - active_ids
    for failure in derived["failures"]:
        assert failure["start_s"] == 0
        assert failure["end_s"] == derived["environment"]["horizon_s"]


def test_active_subset_scenario_rejects_unknown_satellite(scenario) -> None:
    with pytest.raises(ValueError, match="subset"):
        active_subset_scenario(scenario, {"NOT_A_REAL_SATELLITE"})


def test_greedy_sequence_sizes_are_1_to_cap_in_order(small_sequence) -> None:
    assert [evaluation.size for evaluation in small_sequence] == [1, 2, 3]


def test_greedy_sequence_is_deterministic(scenario) -> None:
    first = greedy_sequence(scenario, "minimum_hops", max_size=2)
    second = greedy_sequence(scenario, "minimum_hops", max_size=2)
    assert [e.active_satellite_ids for e in first] == [e.active_satellite_ids for e in second]
    assert [e.worst_availability for e in first] == [e.worst_availability for e in second]


def test_greedy_sequence_is_nested(small_sequence) -> None:
    """Each step's active set must be the previous one plus exactly one satellite."""
    previous: set[str] = set()
    for evaluation in small_sequence:
        current = set(evaluation.active_satellite_ids)
        assert previous <= current
        assert len(current) == len(previous) + 1
        previous = current


def test_greedy_sequence_worst_availability_is_plausible(small_sequence) -> None:
    for evaluation in small_sequence:
        assert 0.0 <= evaluation.worst_availability <= 1.0
        assert 0.0 <= evaluation.mean_availability <= 1.0
        assert evaluation.mean_availability >= evaluation.worst_availability - 1e-9


def test_minimum_size_for_target_finds_first_passing_size() -> None:
    sequence = [
        SubsetEvaluation(["S1"], 1, {}, {}, 0.5, 0.5, 0, 0, False),
        SubsetEvaluation(["S1", "S2"], 2, {}, {}, 0.8, 0.8, 0, 0, False),
        SubsetEvaluation(["S1", "S2", "S3"], 3, {}, {}, 0.95, 0.95, 0, 0, True),
    ]
    assert minimum_size_for_target(sequence, 0.9) == 3
    assert minimum_size_for_target(sequence, 0.99) is None
    assert minimum_size_for_target(sequence, 0.5) == 1


def test_minimum_size_for_target_empty_sequence_returns_none() -> None:
    assert minimum_size_for_target([], 0.9) is None


def test_refine_stage_does_not_mutate_source_and_returns_derived_scenario(
    scenario, small_sequence
) -> None:
    original = copy.deepcopy(scenario)
    subset = small_sequence[-1]  # size 3
    result = refine_stage(scenario, subset, "minimum_hops", budget=2, seed=1)

    assert scenario == original
    assert "derived_scenario" in result
    assert result["derived_scenario"]["design"]["satellites"] == scenario["design"]["satellites"]
    assert 0.0 <= result["refined_worst_availability"] <= 1.0


def test_swap_refine_never_makes_the_result_worse(scenario, small_sequence) -> None:
    start_ids = set(small_sequence[0].active_satellite_ids)  # size 1, cheapest to refine
    refinement = swap_refine(scenario, start_ids, "minimum_hops", max_passes=1)

    assert refinement.result.worst_availability >= refinement.start.worst_availability - 1e-12
    assert refinement.evaluations >= 1
    # A swap was either applied (and helped) or none was found this pass.
    assert len(refinement.swaps_applied) <= 1


def test_swap_refine_does_not_mutate_source_scenario(scenario, small_sequence) -> None:
    original = copy.deepcopy(scenario)
    swap_refine(scenario, set(small_sequence[0].active_satellite_ids), "minimum_hops", max_passes=1)
    assert scenario == original


def test_swap_refine_result_uses_requested_subset_size(scenario, small_sequence) -> None:
    start_ids = set(small_sequence[0].active_satellite_ids)
    refinement = swap_refine(scenario, start_ids, "minimum_hops", max_passes=1)
    assert refinement.result.size == len(start_ids)
    for out_id, in_id in refinement.swaps_applied:
        assert out_id not in refinement.result.active_satellite_ids
        assert in_id in refinement.result.active_satellite_ids


def test_verify_threshold_reports_target_feasibility(scenario, small_sequence) -> None:
    points = verify_threshold(
        scenario, small_sequence, [1, 2], "minimum_hops", target_availability=0.9, max_passes=1
    )
    assert [p.size for p in points] == [1, 2]
    for point in points:
        assert point.target_feasible == (point.refined.result.worst_availability >= 0.9)


def test_verify_threshold_rejects_size_outside_sequence(scenario, small_sequence) -> None:
    with pytest.raises(ValueError, match="not in the supplied"):
        verify_threshold(scenario, small_sequence, [999], "minimum_hops", target_availability=0.9)


def test_first_verified_pass_picks_smallest_passing_size() -> None:
    from app.calculation.optimization.deployment_planner import ThresholdPoint

    points = [
        ThresholdPoint(size=44, greedy=None, refined=None, target_feasible=False),  # type: ignore[arg-type]
        ThresholdPoint(size=45, greedy=None, refined=None, target_feasible=True),  # type: ignore[arg-type]
        ThresholdPoint(size=46, greedy=None, refined=None, target_feasible=True),  # type: ignore[arg-type]
    ]
    assert first_verified_pass(points) == 45
    assert first_verified_pass(points[:1]) is None


def test_marginal_gain_curve_matches_consecutive_deltas() -> None:
    sequence = [
        SubsetEvaluation(["S1"], 1, {}, {}, 0.5, 0.5, 0, 0, False),
        SubsetEvaluation(["S1", "S2"], 2, {}, {}, 0.8, 0.8, 0, 0, False),
        SubsetEvaluation(["S1", "S2", "S3"], 3, {}, {}, 0.95, 0.95, 0, 0, True),
    ]
    curve = marginal_gain_curve(sequence)
    assert [round(c["marginal_gain_pp"], 4) for c in curve] == [50.0, 30.0, 15.0]
    assert [c["size"] for c in curve] == [1, 2, 3]


def test_target_margin_pp_sign_and_magnitude() -> None:
    assert target_margin_pp(0.9667, 0.9) == pytest.approx(6.67, abs=1e-6)
    assert target_margin_pp(0.8972, 0.9) == pytest.approx(-0.28, abs=1e-6)
    assert target_margin_pp(0.9, 0.9) == pytest.approx(0.0, abs=1e-9)


def test_one_swap_then_tabu_improves_and_is_seeded(monkeypatch) -> None:
    satellites = [
        {"id": f"S0{i}", "plane_id": "P1", "slot_deg": i * 90, "launch_batch": 1}
        for i in range(1, 5)
    ]
    toy_scenario = {"design": {"satellites": satellites}}

    def fake_evaluate(_scenario, active_ids, _strategy):
        # S03/S04 is the unique optimum at fixed cardinality two.
        value = sum(int(sid[-1]) for sid in active_ids) / 10
        return SubsetEvaluation(
            sorted(active_ids),
            len(active_ids),
            {"P1": len(active_ids)},
            {},
            value,
            value,
            0,
            0,
            False,
        )

    monkeypatch.setattr(
        "app.calculation.optimization.deployment_planner.evaluate_subset", fake_evaluate
    )
    initial = fake_evaluate(toy_scenario, {"S01", "S02"}, "minimum_hops")
    kwargs = {
        "one_swap_passes": 2,
        "tabu_iterations": 3,
        "tabu_candidates_per_iteration": 4,
        "tabu_tenure": 2,
        "seed": 7,
    }
    first = refine_subset_local_search(toy_scenario, initial, "minimum_hops", **kwargs)
    second = refine_subset_local_search(toy_scenario, initial, "minimum_hops", **kwargs)

    assert first.best.active_satellite_ids == ["S03", "S04"]
    assert first.best.worst_availability > initial.worst_availability
    assert first.best == second.best
    assert first.one_swap_evaluations > 0
    assert first.tabu_evaluations > 0


def test_evaluate_subset_reflects_plane_parameters_override(scenario) -> None:
    """Deployment planning must be able to target a NON-default geometry
    (e.g. Recommended Robust 2.0) — this is what the API's optional
    `plane_parameters` override ultimately relies on."""
    robust_2_0 = {
        "P1.raan_deg": 104.47125962122719, "P1.phase_deg": 303.7966152991311,
        "P2.raan_deg": 226.2918165087214, "P2.phase_deg": 247.99724234679812,
        "P3.raan_deg": 159.35288435343463, "P3.phase_deg": 241.55945892515913,
    }
    rotated_scenario = apply_plane_parameters(scenario, robust_2_0)
    fixed_subset = {f"S{i:02d}" for i in range(1, 17)}  # first 16 by id, arbitrary but fixed

    baseline_result = evaluate_subset(scenario, fixed_subset, "minimum_hops")
    rotated_result = evaluate_subset(rotated_scenario, fixed_subset, "minimum_hops")

    assert baseline_result.worst_availability != pytest.approx(rotated_result.worst_availability)
