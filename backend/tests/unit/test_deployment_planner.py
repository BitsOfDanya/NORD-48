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

from app.calculation.optimization.deployment_planner import (
    SubsetEvaluation,
    active_subset_scenario,
    greedy_sequence,
    minimum_size_for_target,
    refine_stage,
    refine_subset_local_search,
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
