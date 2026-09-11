"""Objective function definitions for constellation optimization.

Not implemented yet. This module will define the objective(s) used to score
a candidate constellation configuration — e.g. a weighted combination of
availability, outage duration, and deployment cost — computed by calling
into the backend calculation engine (never by re-implementing physics here).
"""


def evaluate(config: dict) -> float:
    """Score a candidate constellation configuration.

    Args:
        config: candidate constellation parameters (planes, sats/plane,
            altitude, inclination, RAAN/phase offsets, etc.).

    Returns:
        A scalar objective value (higher or lower is better, TBD).
    """
    raise NotImplementedError(
        "Objective function not implemented yet — depends on the backend "
        "calculation engine (metrics module) being available first."
    )
