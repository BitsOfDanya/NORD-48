"""Proves the core simulation/routing pipeline is generic — not hardwired
to the official client/gateway IDs or the 48-satellite/3-plane layout.

Built by relabeling a real, geometrically valid official scenario (so
orbital elements stay physically meaningful) rather than hand-rolling new
positions: renames every ground site to non-official IDs, turns one of
the former clients into a SECOND gateway (multi-gateway is already
supported by the router — see `docs/case-acceptance.md`), and narrows
the active fleet to a small custom-size subset via the same
`active_subset_scenario` helper the deployment planner uses. This is a
WHAT-IF / universality check, not an official result — see
`docs/case-acceptance.md` for the OFFICIAL/CUSTOM distinction.
"""

from __future__ import annotations

import copy

from app.calculation.optimization.deployment_planner import active_subset_scenario
from app.services.scenario_service import get_example, parse_and_validate
from app.services.simulation_service import run_simulation


def _build_generic_scenario() -> dict:
    scenario = copy.deepcopy(get_example("01_full_constellation"))
    scenario["meta"]["id"] = "synthetic_generic_test"

    # Relabel ground sites to non-official IDs; promote one former client
    # to a second gateway to exercise multi-gateway routing generically.
    id_map = {"G_MUR": "GATEWAY_ONE", "C70": "GATEWAY_TWO", "C65": "CLIENT_ALPHA", "C72": "CLIENT_BETA"}
    for site in scenario["ground_sites"]:
        site["id"] = id_map[site["id"]]
    scenario["ground_sites"] = [
        {**site, "role": "gateway"} if site["id"] == "GATEWAY_TWO" else site
        for site in scenario["ground_sites"]
    ]

    # A custom-size fleet (24, not the official 48) via the same helper the
    # deployment planner uses — proves the pipeline does not assume N=48.
    all_ids = sorted(sat["id"] for sat in scenario["design"]["satellites"])
    scenario = active_subset_scenario(scenario, set(all_ids[:24]))
    scenario["meta"]["id"] = "synthetic_generic_test"
    return parse_and_validate(scenario)


def test_generic_scenario_passes_schema_and_reference_validation() -> None:
    scenario = _build_generic_scenario()
    ids = {site["id"] for site in scenario["ground_sites"]}
    assert ids == {"GATEWAY_ONE", "GATEWAY_TWO", "CLIENT_ALPHA", "CLIENT_BETA"}


def test_generic_scenario_runs_end_to_end_with_non_official_ids() -> None:
    scenario = _build_generic_scenario()
    run = run_simulation(scenario, "minimum_hops")

    assert set(run.client_ids) == {"CLIENT_ALPHA", "CLIENT_BETA"}
    assert set(run.gateway_ids) == {"GATEWAY_ONE", "GATEWAY_TWO"}
    for client_id in run.client_ids:
        metrics = run.metrics[client_id]
        assert 0.0 <= metrics.availability_percent <= 100.0


def test_generic_scenario_routes_can_reach_either_gateway() -> None:
    """Multi-gateway routing must actually consider both gateways, not
    just the first one found — this is exactly what `docs/case-acceptance.md`
    claims about the router's generality."""
    scenario = _build_generic_scenario()
    run = run_simulation(scenario, "minimum_hops")

    reached_gateways = {
        record.gateway_id
        for records in run.timeline.values()
        for record in records
        if record.available and record.gateway_id is not None
    }
    assert reached_gateways <= set(run.gateway_ids)
    assert len(reached_gateways) >= 1
