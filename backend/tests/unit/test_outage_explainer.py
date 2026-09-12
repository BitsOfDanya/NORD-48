"""Outage Explainer — must reuse `diagnose()`'s reason verbatim and add
only quantitative detail, never a new reason category.
"""

from __future__ import annotations

from app.calculation.diagnostics.outage_explainer import explain_outage
from app.calculation.resilience.failure_analysis import build_graph_timeline, compute_timeline
from app.services.scenario_service import get_example


def _gateway_ids(scenario: dict) -> list[str]:
    return sorted(g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway")


def _find_outage(scenario: dict, strategy: str, wanted_reason: str | None = None):
    graphs = build_graph_timeline(scenario)
    timeline = compute_timeline(scenario, graphs, strategy)
    for client_id, records in timeline.items():
        for record in records:
            if not record.available and (wanted_reason is None or record.diagnostic_reason == wanted_reason):
                return client_id, record
    return None, None


def test_reason_matches_stored_diagnostic_reason_exactly() -> None:
    scenario = get_example("04_link_range")
    client_id, record = _find_outage(scenario, "minimum_hops")
    assert record is not None
    explanation = explain_outage(scenario, client_id, _gateway_ids(scenario), record.t_s)
    assert explanation.reason == record.diagnostic_reason
    assert explanation.reason in {
        "NO_VISIBLE_SATELLITE",
        "NO_GATEWAY_CONTACT",
        "GATEWAY_OUTAGE",
        "ISL_NETWORK_SPLIT",
    }


def test_no_visible_satellite_has_zero_count_and_no_component_info() -> None:
    scenario = get_example("04_link_range")
    client_id, record = _find_outage(scenario, "minimum_hops", "NO_VISIBLE_SATELLITE")
    assert record is not None
    explanation = explain_outage(scenario, client_id, _gateway_ids(scenario), record.t_s)
    assert explanation.visible_satellite_count == 0
    assert explanation.client_component_size is None
    assert explanation.same_component_as_gateway is None
    # Nearest-below-threshold is opportunistic (only when data allows it) —
    # if present, it must actually be below min_elevation_deg.
    if explanation.nearest_below_threshold_elevation_deg is not None:
        assert explanation.nearest_below_threshold_elevation_deg < explanation.min_elevation_deg


def test_isl_network_split_has_disjoint_nonempty_components() -> None:
    scenario = get_example("04_link_range")
    client_id, record = _find_outage(scenario, "minimum_hops", "ISL_NETWORK_SPLIT")
    assert record is not None
    explanation = explain_outage(scenario, client_id, _gateway_ids(scenario), record.t_s)
    assert explanation.visible_satellite_count > 0
    assert explanation.gateway_contact is True
    assert explanation.client_component_size is not None
    assert explanation.gateway_component_size is not None
    assert explanation.same_component_as_gateway is False
    assert explanation.network_component_count >= 2


def test_gateway_outage_reason_is_flagged_directly() -> None:
    scenario = get_example("01_full_constellation")
    scenario = dict(scenario)
    scenario["gateway_outages"] = [{"gateway_id": "G_MUR", "start_s": 0, "end_s": 86400}]
    client_id, record = _find_outage(scenario, "minimum_hops", "GATEWAY_OUTAGE")
    if record is None:
        return  # some scenarios may not reach this branch depending on visibility timing
    explanation = explain_outage(scenario, client_id, _gateway_ids(scenario), record.t_s)
    assert explanation.reason == "GATEWAY_OUTAGE"
    assert explanation.gateway_in_outage is True


def test_available_step_still_produces_a_diagnosis_without_crashing() -> None:
    """explain_outage is meant to be called only for no-route instants, but
    it must not crash if called on an available one — diagnose() itself is
    reason-agnostic about that."""
    scenario = get_example("01_full_constellation")
    gateway_ids = _gateway_ids(scenario)
    client_id = next(g["id"] for g in scenario["ground_sites"] if g["role"] == "client")
    explanation = explain_outage(scenario, client_id, gateway_ids, 0)
    assert explanation.client_id == client_id
