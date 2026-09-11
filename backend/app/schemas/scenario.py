"""Pydantic v2 schemas for the `cosmo-A-1.0` scenario format.

This is the API/schema layer: it validates JSON structure and types, and
round-trips a scenario back to a plain dict without losing fields (unknown
fields are preserved via `extra="allow"`). It does **not** replace the
organizers' reference validation in `geometry.validate()` — business rules
(angle ranges, ID uniqueness, valid time grids, ...) are still enforced
there. See `app/calculation/geometry/adapter.py`.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class MetaSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    title: str | None = None


class EnvironmentSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    altitude_km: float
    inclination_deg: float
    earth_angle0_deg: float
    horizon_s: int
    step_s: int
    min_elevation_deg: float
    isl_range_km: float
    target_availability: float


class PlaneSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    raan_deg: float
    phase_deg: float


class SatelliteSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    plane_id: str
    slot_deg: float
    launch_batch: int


class DesignSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    launch_stage: int
    planes: list[PlaneSchema]
    satellites: list[SatelliteSchema]


class GroundSiteSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str | None = None
    role: Literal["client", "gateway"]
    lat_deg: float
    lon_deg: float


class FailureSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    satellite_id: str
    start_s: float
    end_s: float


class GatewayOutageSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    gateway_id: str
    start_s: float
    end_s: float


class ScenarioSchema(BaseModel):
    """Top-level scenario document.

    `extra="allow"` on every nested model means any field present in the
    source JSON survives a `model_validate` -> `model_dump` round trip,
    even if it isn't explicitly listed here.
    """

    model_config = ConfigDict(extra="allow")

    schema_version: str
    meta: MetaSchema
    environment: EnvironmentSchema
    design: DesignSchema
    ground_sites: list[GroundSiteSchema]
    failures: list[FailureSchema] = Field(default_factory=list)
    gateway_outages: list[GatewayOutageSchema] = Field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialize back to a plain JSON-safe dict for the calculation engine."""
        return self.model_dump(mode="json")
