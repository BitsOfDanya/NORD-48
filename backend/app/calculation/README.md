# Calculation Engine

This package holds the simulation logic for the constellation.

## Modules

- **`geometry/`** — physical model. `reference_geometry.py` is the
  organizers' implementation, copied unmodified from
  `case_materials/calculation/geometry.py` — **never edit it**. Everything
  else in the codebase goes through `adapter.py`, which exposes
  `load_scenario`, `validate_scenario`, `get_snapshot`, and a presentation-
  only `ecef_to_geodetic` helper for the frontend globe view.
- **`network/`** — `graph.py` turns one geometry snapshot into a NetworkX
  contact graph, and builds a per-client routing view that excludes every
  *other* client ground node (the one rule `geometry.py` itself doesn't
  encode: ground clients must never relay another client's traffic).
- **`routing/`** — `router.py` finds the best `client -> satellite(s) ->
  gateway` path over a client's routing graph: `minimum_hops` (BFS,
  default) or `minimum_distance` (Dijkstra).
- **`metrics/`** — `metrics.py` computes availability, visibility, outage
  counts/duration, hop and route-change stats from a client's full-horizon
  timeline.
- **`diagnostics/`** — `diagnostics.py` explains *why* a route is missing
  at a given time: `NO_VISIBLE_SATELLITE`, `NO_GATEWAY_CONTACT`,
  `GATEWAY_OUTAGE`, or `ISL_NETWORK_SPLIT`.

## Data flow

```
JSON Scenario -> geometry -> network -> routing -> metrics -> diagnostics
```

Orchestrated by `app/services/simulation_service.py`. See
[docs/architecture.md](../../../docs/architecture.md) and
[docs/calculation-model.md](../../../docs/calculation-model.md) for the
full picture, including comparison, resilience, and exact optimization
layers, and the acceptance/regression numbers this pipeline must reproduce.
