# Calculation Engine

This package will hold the exact simulation logic for the constellation. It is
currently scaffolding only — **no calculation logic is implemented yet**.

## Modules

- **`geometry/`** — physical model. Satellite/ground positions, orbital
  propagation, line-of-sight and range checks. The organizers' reference
  implementation lives at
  [`geometry/reference_geometry.py`](geometry/reference_geometry.py) (copied
  unmodified from `case_materials/calculation/geometry.py`) and should be
  wrapped by an adapter here rather than rewritten.
- **`network/`** — turns geometry snapshots into a dynamic contact graph
  (ground-to-satellite and inter-satellite links) over the simulation
  timeline.
- **`routing/`** — builds routes `client -> satellite(s) -> gateway` over the
  dynamic graph produced by `network/`.
- **`metrics/`** — computes availability, outage periods, hop counts, and
  other resilience metrics from routing results.
- **`diagnostics/`** — explains *why* a route is unavailable at a given time
  (no visible satellite, no path to gateway, satellite/gateway outage, etc.).

## Data flow

```
JSON Scenario -> geometry -> network -> routing -> metrics -> diagnostics
```

See [docs/architecture.md](../../../docs/architecture.md) for how this fits
into the full system (API, comparison/resilience layers, optimization).

## Non-goals right now

Per the current project phase, this package intentionally contains no
orbital mechanics, graph-building, routing, or metrics logic — only the
package structure and the reference geometry file. See the root README for
the planned next implementation step.
