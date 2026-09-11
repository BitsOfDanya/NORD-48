"""Dataset construction for surrogate models.

Not implemented yet. This module will assemble training datasets (config ->
metrics pairs) from backend simulation runs, for use by `surrogate/model.py`.
"""


def build_dataset(scenarios: list[dict]):
    """Build a surrogate-model training dataset from simulation results.

    Args:
        scenarios: scenario configurations to simulate and collect metrics
            for.

    Returns:
        A dataset object (structure TBD, likely a pandas DataFrame).
    """
    raise NotImplementedError(
        "Surrogate dataset construction not implemented yet — depends on "
        "the backend simulation service being available first."
    )
