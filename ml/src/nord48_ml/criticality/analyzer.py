"""Criticality analysis — identifying critical satellites / links.

Not implemented yet. This module will identify which satellites or links
contribute disproportionately to network resilience (e.g. via removal
analysis on the dynamic contact graph produced by the backend calculation
engine's network module).
"""


def find_critical_satellites(scenario: dict) -> list[str]:
    """Identify satellites whose failure most degrades network resilience.

    Args:
        scenario: scenario to analyze.

    Returns:
        Satellite identifiers ranked by criticality (structure TBD).
    """
    raise NotImplementedError(
        "Criticality analysis not implemented yet — depends on the backend "
        "network/metrics modules being available first."
    )
