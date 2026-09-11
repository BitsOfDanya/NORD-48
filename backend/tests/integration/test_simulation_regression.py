"""Regression/acceptance tests: full simulation pipeline against known-good
availability/visibility/max_outage values for all 4 bundled scenarios,
routing_strategy=minimum_hops, unmodified reference geometry.

These numbers come from the hackathon case acceptance criteria. If a
change makes them drift, the bug is in graph construction, active
filtering, ground-relay handling, the time grid, or route logic — never
adjust these expected values to match new output.
"""

import pytest

from app.services import scenario_service, simulation_service

TOLERANCE = 1e-6

# scenario_id -> client_id -> (availability_fraction, max_outage_s)
EXPECTED = {
    "01_full_constellation": {
        "C65": (0.9666666667, 480),
        "C70": (0.9875000000, 120),
        "C72": (0.9888888889, 120),
    },
    "02_first_launch": {
        "C65": (0.2722222222, 34320),
        "C70": (0.1583333333, 39480),
        "C72": (0.1263888889, 47760),
    },
    "03_satellite_outages": {
        "C65": (0.7930555556, 1440),
        "C70": (0.8083333333, 1440),
        "C72": (0.8250000000, 1200),
    },
    "04_link_range": {
        "C65": (0.7750000000, 5640),
        "C70": (0.6222222222, 10680),
        "C72": (0.6513888889, 240),
    },
}


@pytest.mark.parametrize("scenario_id", sorted(EXPECTED))
def test_time_grid_is_720_steps(scenario_id: str) -> None:
    scenario = scenario_service.get_example(scenario_id)
    run = simulation_service.run_simulation(scenario, "minimum_hops")

    assert run.n_steps == 720
    assert run.step_s == 120
    assert run.horizon_s == 86400
    for records in run.timeline.values():
        assert len(records) == 720
        assert records[0].t_s == 0
        assert records[-1].t_s == 86280  # last step, right boundary (86400) excluded


@pytest.mark.parametrize("scenario_id", sorted(EXPECTED))
def test_acceptance_metrics(scenario_id: str) -> None:
    scenario = scenario_service.get_example(scenario_id)
    run = simulation_service.run_simulation(scenario, "minimum_hops")

    for client_id, (expected_availability, expected_max_outage_s) in EXPECTED[scenario_id].items():
        metrics = run.metrics[client_id]
        assert metrics.availability_fraction == pytest.approx(expected_availability, abs=TOLERANCE), (
            f"{scenario_id}/{client_id}: availability mismatch"
        )
        assert metrics.max_outage_s == expected_max_outage_s, (
            f"{scenario_id}/{client_id}: max_outage_s mismatch"
        )


def test_full_constellation_all_clients_meet_target() -> None:
    scenario = scenario_service.get_example("01_full_constellation")
    run = simulation_service.run_simulation(scenario, "minimum_hops")

    for client_id in run.client_ids:
        assert run.metrics[client_id].target_achieved is True


@pytest.mark.parametrize("scenario_id", ["02_first_launch", "03_satellite_outages", "04_link_range"])
def test_degraded_scenarios_miss_target(scenario_id: str) -> None:
    scenario = scenario_service.get_example(scenario_id)
    run = simulation_service.run_simulation(scenario, "minimum_hops")

    for client_id in run.client_ids:
        assert run.metrics[client_id].target_achieved is False
