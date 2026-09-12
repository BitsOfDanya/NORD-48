from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.calculation.metrics.metrics import ClientMetrics
from app.core.exceptions import SimulationNotFoundError
from app.models.route import RouteRecord
from app.models.simulation import SimulationRun
from app.services import simulation_service


def _sample_run() -> SimulationRun:
    run_id = "f7fa8337-b86e-4b4f-9bbf-934d13cb1321"
    return SimulationRun(
        run_id=run_id,
        scenario={"meta": {"id": "jury"}},
        routing_strategy="maximum_margin",
        step_s=120,
        horizon_s=240,
        n_steps=2,
        client_ids=["C65"],
        gateway_ids=["G_MUR"],
        metrics={
            "C65": ClientMetrics(
                client_id="C65",
                visibility_fraction=1.0,
                visibility_percent=100.0,
                availability_fraction=0.5,
                availability_percent=50.0,
                target_availability=0.9,
                target_achieved=False,
                max_outage_s=120,
                outage_count=1,
                average_hops=2.0,
                route_change_count=1,
                average_route_distance_km=2500.0,
            )
        },
        timeline={
            "C65": [
                RouteRecord(
                    t_s=0,
                    client_id="C65",
                    gateway_id="G_MUR",
                    strategy="maximum_margin",
                    path=["C65", "S01", "G_MUR"],
                    hops=2,
                    total_distance_km=2500.0,
                    bottleneck_margin=0.3,
                    bottleneck_edge=("S01", "G_MUR"),
                    visible=True,
                ),
                RouteRecord(
                    t_s=120,
                    client_id="C65",
                    gateway_id=None,
                    strategy="maximum_margin",
                    visible=False,
                    diagnostic_reason="no_visible_satellite",
                ),
            ]
        },
    )


def test_completed_run_survives_memory_reset(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        simulation_service,
        "get_settings",
        lambda: SimpleNamespace(runs_dir=str(tmp_path)),
    )
    run = _sample_run()

    simulation_service._persist_run(run)
    simulation_service._RUNS.clear()

    restored = simulation_service.get_run(run.run_id)
    assert restored.run_id == run.run_id
    assert restored.metrics["C65"].availability_percent == 50.0
    assert restored.timeline["C65"][0].bottleneck_edge == ("S01", "G_MUR")
    assert restored.timeline["C65"][1].diagnostic_reason == "no_visible_satellite"


def test_invalid_run_id_cannot_escape_storage(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(
        simulation_service,
        "get_settings",
        lambda: SimpleNamespace(runs_dir=str(tmp_path)),
    )

    with pytest.raises(SimulationNotFoundError):
        simulation_service.get_run("../../etc/passwd")
