"""Surrogate model for fast approximate metric prediction.

Not implemented yet. This module will train/serve a fast approximate model
(e.g. scikit-learn, optionally CatBoost/XGBoost later) to predict simulation
metrics without running the full exact calculation engine — used to speed
up optimization search, never as a replacement for the exact simulator when
reporting final results.
"""


def train(dataset) -> None:
    """Train a surrogate model on a dataset built by `surrogate/dataset.py`."""
    raise NotImplementedError(
        "Surrogate model training not implemented yet — no models are "
        "trained at this stage of the project."
    )


def predict(model, config: dict) -> dict:
    """Predict metrics for a configuration using a trained surrogate model."""
    raise NotImplementedError("Surrogate model prediction not implemented yet.")
