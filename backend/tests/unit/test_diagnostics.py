"""Unit tests for the deterministic no-route diagnostics decision tree."""

import networkx as nx

from app.calculation.diagnostics.diagnostics import diagnose


def _scenario(gateway_outages: list[dict] | None = None) -> dict:
    return {"gateway_outages": gateway_outages or []}


def test_no_visible_satellite() -> None:
    graph = nx.Graph()
    graph.add_node("C1")
    graph.add_edge("S1", "GW", distance_km=1)

    result = diagnose(graph, _scenario(), "C1", ["GW"], t_s=0)

    assert result.reason == "NO_VISIBLE_SATELLITE"
    assert result.checks == {
        "visible_satellite": False,
        "gateway_contact": False,
        "isl_connectivity": False,
    }


def test_no_gateway_contact() -> None:
    graph = nx.Graph()
    graph.add_edge("C1", "S1", distance_km=1)
    graph.add_node("GW")  # gateway has zero contacts

    result = diagnose(graph, _scenario(), "C1", ["GW"], t_s=0)

    assert result.reason == "NO_GATEWAY_CONTACT"
    assert result.checks["visible_satellite"] is True
    assert result.checks["gateway_contact"] is False


def test_gateway_outage_takes_priority_over_no_contact() -> None:
    graph = nx.Graph()
    graph.add_edge("C1", "S1", distance_km=1)
    graph.add_edge("S2", "GW", distance_km=1)  # gateway WOULD have contact...

    scenario = _scenario(gateway_outages=[{"gateway_id": "GW", "start_s": 0, "end_s": 1000}])
    result = diagnose(graph, scenario, "C1", ["GW"], t_s=500)

    assert result.reason == "GATEWAY_OUTAGE"
    assert result.gateway_id == "GW"


def test_gateway_outage_outside_window_does_not_apply() -> None:
    graph = nx.Graph()
    graph.add_edge("C1", "S1", distance_km=1)
    graph.add_node("GW")

    scenario = _scenario(gateway_outages=[{"gateway_id": "GW", "start_s": 0, "end_s": 1000}])
    result = diagnose(graph, scenario, "C1", ["GW"], t_s=2000)

    assert result.reason == "NO_GATEWAY_CONTACT"


def test_isl_network_split() -> None:
    graph = nx.Graph()
    graph.add_edge("C1", "S1", distance_km=1)
    graph.add_edge("S2", "GW", distance_km=1)
    # S1 and S2 both have contact but are not connected to each other.

    result = diagnose(graph, _scenario(), "C1", ["GW"], t_s=0)

    assert result.reason == "ISL_NETWORK_SPLIT"
    assert result.checks == {
        "visible_satellite": True,
        "gateway_contact": True,
        "isl_connectivity": False,
    }
