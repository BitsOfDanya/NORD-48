"""Deterministic explanations for why a client has no route.

Only meaningful when routing found no path for a client at a given time.
Reason categories:

- `NO_VISIBLE_SATELLITE` — the client has no satellite contact at all.
- `GATEWAY_OUTAGE` — the (candidate) gateway is inside a scheduled outage
  window at this time.
- `NO_GATEWAY_CONTACT` — the gateway has no satellite contact (and is not
  in a scheduled outage).
- `ISL_NETWORK_SPLIT` — both client and gateway have satellite contact,
  but the inter-satellite network does not connect them.

Purely a decision tree over the same snapshot/graph data routing already
computed — no ML, no heuristics.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import networkx as nx


@dataclass
class DiagnosticResult:
    reason: str
    gateway_id: str | None
    checks: dict[str, bool]


_PRIORITY = {"ISL_NETWORK_SPLIT": 0, "NO_GATEWAY_CONTACT": 1, "GATEWAY_OUTAGE": 2}


def _gateway_in_outage(scenario: dict[str, Any], gateway_id: str, t_s: float) -> bool:
    return any(
        outage["gateway_id"] == gateway_id and outage["start_s"] <= t_s < outage["end_s"]
        for outage in scenario.get("gateway_outages", [])
    )


def diagnose(
    full_graph: nx.Graph,
    scenario: dict[str, Any],
    client_id: str,
    gateway_ids: list[str],
    t_s: float,
) -> DiagnosticResult:
    """Explain why `client_id` has no route to any gateway at time `t_s`."""
    visible_satellite = full_graph.has_node(client_id) and full_graph.degree(client_id) > 0
    if not visible_satellite:
        return DiagnosticResult(
            reason="NO_VISIBLE_SATELLITE",
            gateway_id=None,
            checks={
                "visible_satellite": False,
                "gateway_contact": False,
                "isl_connectivity": False,
            },
        )

    # Evaluate every configured gateway and report the most actionable
    # reason: an ISL split (client and gateway both have contact, but the
    # satellite network doesn't connect them) is more informative than a
    # gateway that is simply offline or unreachable, given the client IS
    # otherwise connected to the network.
    best: tuple[int, str, str, dict[str, bool]] | None = None
    for gateway_id in sorted(gateway_ids):
        if _gateway_in_outage(scenario, gateway_id, t_s):
            reason = "GATEWAY_OUTAGE"
            gateway_contact = False
        else:
            gateway_contact = full_graph.has_node(gateway_id) and full_graph.degree(gateway_id) > 0
            reason = "ISL_NETWORK_SPLIT" if gateway_contact else "NO_GATEWAY_CONTACT"

        checks = {
            "visible_satellite": True,
            "gateway_contact": gateway_contact,
            "isl_connectivity": False,
        }
        rank = _PRIORITY[reason]
        if best is None or rank < best[0]:
            best = (rank, reason, gateway_id, checks)

    if best is None:
        return DiagnosticResult(
            reason="NO_GATEWAY_CONTACT",
            gateway_id=None,
            checks={"visible_satellite": True, "gateway_contact": False, "isl_connectivity": False},
        )

    _, reason, gateway_id, checks = best
    return DiagnosticResult(reason=reason, gateway_id=gateway_id, checks=checks)
