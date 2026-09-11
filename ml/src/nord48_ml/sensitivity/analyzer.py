"""Sensitivity analysis of constellation metrics to input parameters.

Not implemented yet. This module will quantify how much simulation outputs
(availability, outages, ...) change in response to changes in constellation
parameters (RAAN, phase, altitude, inclination, failure rates, ...).
"""


def analyze(scenario: dict, parameters: list[str]) -> dict:
    """Compute sensitivity of simulation metrics to the given parameters.

    Args:
        scenario: base scenario to perturb.
        parameters: names of scenario parameters to vary.

    Returns:
        A sensitivity report (structure TBD).
    """
    raise NotImplementedError(
        "Sensitivity analysis not implemented yet — depends on the backend "
        "simulation service being available first."
    )
