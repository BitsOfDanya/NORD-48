"""Feature extraction from scenarios / simulation results.

Not implemented yet. This module will turn a scenario configuration and/or
simulation output into a flat feature vector for use by sensitivity,
criticality, and surrogate modules.
"""


def extract(scenario: dict) -> dict:
    """Extract a feature vector from a scenario configuration.

    Args:
        scenario: scenario to extract features from.

    Returns:
        A dict of feature name -> value (structure TBD).
    """
    raise NotImplementedError("Feature extraction not implemented yet.")
