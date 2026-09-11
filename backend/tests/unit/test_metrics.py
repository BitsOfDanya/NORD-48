"""Unit tests for per-client metric computation."""

from app.calculation.metrics.metrics import compute_client_metrics


def test_max_outage_and_availability() -> None:
    # 10 steps, step_s=120: 6 available, 4 not -> 0.6. Longest outage run = 3 -> 360s.
    available = [True, True, False, False, False, True, True, False, True, True]
    visible = [True] * 10
    hops = [1 if a else None for a in available]
    distances = [10.0 if a else None for a in available]
    paths = [("C1", "GW") if a else () for a in available]

    metrics = compute_client_metrics(
        client_id="C1",
        visible_flags=visible,
        available_flags=available,
        hops=hops,
        distances=distances,
        paths=paths,
        step_s=120,
        target_availability=0.9,
    )

    assert metrics.availability_fraction == 0.6
    assert metrics.max_outage_s == 360
    assert metrics.outage_count == 2
    assert metrics.target_achieved is False
    assert metrics.average_hops == 1
    assert metrics.average_route_distance_km == 10.0


def test_visibility_can_exceed_availability() -> None:
    visible = [True, True, True]
    available = [True, False, False]
    metrics = compute_client_metrics(
        client_id="C1",
        visible_flags=visible,
        available_flags=available,
        hops=[1, None, None],
        distances=[10.0, None, None],
        paths=[("C1", "GW"), (), ()],
        step_s=120,
        target_availability=0.9,
    )

    assert metrics.visibility_fraction == 1.0
    assert metrics.availability_fraction < metrics.visibility_fraction


def test_route_change_count() -> None:
    paths = [("C1", "S1", "GW"), ("C1", "S1", "GW"), ("C1", "S2", "GW"), ()]
    metrics = compute_client_metrics(
        client_id="C1",
        visible_flags=[True, True, True, False],
        available_flags=[True, True, True, False],
        hops=[2, 2, 2, None],
        distances=[10.0, 10.0, 12.0, None],
        paths=paths,
        step_s=120,
        target_availability=0.9,
    )

    # step0->1 same, 1->2 changed, 2->3 changed (to no-route) = 2 changes
    assert metrics.route_change_count == 2


def test_outage_starting_at_step_zero_counts_as_one_outage() -> None:
    available = [False, False, True]
    metrics = compute_client_metrics(
        client_id="C1",
        visible_flags=[False, False, True],
        available_flags=available,
        hops=[None, None, 1],
        distances=[None, None, 5.0],
        paths=[(), (), ("C1", "GW")],
        step_s=60,
        target_availability=0.9,
    )

    assert metrics.outage_count == 1
    assert metrics.max_outage_s == 120
