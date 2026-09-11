# Calculation Model

This describes the intended physical/network model, **not yet
implemented**. It exists so future work has a fixed reference point.

## Baseline dataset

- 48 satellites, 3 orbital planes, 16 satellites per plane.
- Altitude: 550 km.
- Inclination: 87°.
- Simulation horizon: 86400 s, step: 120 s.
- Target availability: 0.9.
- Ground clients, a gateway, satellite failures, and gateway outages are
  part of the scenario.

## Reference implementation

The organizers provided `geometry.py`, preserved unmodified at
[`backend/app/calculation/geometry/reference_geometry.py`](../backend/app/calculation/geometry/reference_geometry.py)
(original also kept at
[`case_materials/calculation/geometry.py`](../case_materials/calculation/geometry.py)).
Its public functions:

- `load(path)` — load a scenario JSON file.
- `validate(scenario)` — validate a scenario dict.
- `positions(scenario, t_s)` — satellite positions at time `t_s`.
- `ground_position(ground_site)` — a ground site's ECEF/ECI position.
- `snapshot(scenario, t_s)` — full state snapshot at time `t_s`.
- `sunlight(scenario, t_s, sun_eci)` — eclipse/sunlight state per satellite.

This file must not be rewritten — it should be wrapped by an adapter in
`backend/app/calculation/geometry/` as the calculation engine is built.

## Planned pipeline

See [architecture.md](architecture.md) for the full data flow diagram
(`geometry -> network -> routing -> metrics -> diagnostics`). Each stage is
scaffolded as an empty package under `backend/app/calculation/` — see that
package's own [README](../backend/app/calculation/README.md).
