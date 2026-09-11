"""Search / optimization strategies over the constellation parameter space.

Not implemented yet. This module will wrap a search strategy (e.g. Optuna
study, SciPy optimizer) around `objective.evaluate`. Any candidate found by
this search must be re-verified against the exact backend calculation
engine before being reported as a result — search here is a heuristic, not
a source of truth.
"""


def optimize(search_space: dict, n_trials: int = 0):
    """Search the constellation parameter space for a better configuration.

    Args:
        search_space: parameter bounds/choices to search over.
        n_trials: number of search iterations/trials to run.

    Returns:
        The best candidate configuration found (not yet defined).
    """
    raise NotImplementedError(
        "Optimization search not implemented yet — depends on objective.py "
        "and the backend calculation engine."
    )
