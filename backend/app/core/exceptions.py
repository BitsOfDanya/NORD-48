class Nord48Error(Exception):
    """Base exception for NORD-48 application errors."""


class ScenarioNotFoundError(Nord48Error):
    """Raised when a requested scenario cannot be found."""


class SimulationNotFoundError(Nord48Error):
    """Raised when a requested simulation run cannot be found."""


class InvalidScenarioError(Nord48Error):
    """Raised when a scenario fails schema or reference validation."""
