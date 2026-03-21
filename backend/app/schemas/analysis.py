from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.satellite import PassWindow, PointQuery, SatelliteSummary


class SatelliteFilters(BaseModel):
    country: str | None = None
    operator: str | None = None
    orbit_type: str | None = None
    purpose: str | None = None
    search: str | None = None


class PointPassRequest(BaseModel):
    lat: float
    lon: float
    from_time: datetime
    horizon_hours: int = 24
    step_seconds: int = 120
    filters: SatelliteFilters | None = None

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, value: float) -> float:
        if not -90 <= value <= 90:
            raise ValueError("Latitude must be between -90 and 90")
        return value

    @field_validator("lon")
    @classmethod
    def validate_lon(cls, value: float) -> float:
        if not -180 <= value <= 180:
            raise ValueError("Longitude must be between -180 and 180")
        return value

    @field_validator("horizon_hours")
    @classmethod
    def validate_horizon(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("horizon_hours must be greater than 0")
        return value

    @field_validator("step_seconds")
    @classmethod
    def validate_step(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("step_seconds must be greater than 0")
        return value


class GeoJSONPolygonRegion(BaseModel):
    type: Literal["geojson_polygon"]
    coordinates: list[list[list[float]]]

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, value: list[list[list[float]]]) -> list[list[list[float]]]:
        if not value or not value[0] or len(value[0]) < 4:
            raise ValueError("GeoJSON polygon must contain at least 4 coordinate pairs")
        for lon, lat in value[0]:
            if not -180 <= lon <= 180 or not -90 <= lat <= 90:
                raise ValueError("GeoJSON polygon coordinates are out of range")
        return value


class BBoxRegion(BaseModel):
    type: Literal["bbox"]
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float

    @model_validator(mode="after")
    def validate_bbox(self) -> "BBoxRegion":
        if not -90 <= self.min_lat <= 90 or not -90 <= self.max_lat <= 90:
            raise ValueError("BBox latitude is out of range")
        if not -180 <= self.min_lon <= 180 or not -180 <= self.max_lon <= 180:
            raise ValueError("BBox longitude is out of range")
        if self.max_lat <= self.min_lat or self.max_lon <= self.min_lon:
            raise ValueError("BBox max values must be greater than min values")
        return self


class CircleRegion(BaseModel):
    type: Literal["circle"]
    center_lat: float
    center_lon: float
    radius_km: float

    @model_validator(mode="after")
    def validate_circle(self) -> "CircleRegion":
        if not -90 <= self.center_lat <= 90:
            raise ValueError("Circle center latitude is out of range")
        if not -180 <= self.center_lon <= 180:
            raise ValueError("Circle center longitude is out of range")
        if self.radius_km <= 0:
            raise ValueError("Circle radius_km must be greater than 0")
        return self


RegionInput = Annotated[GeoJSONPolygonRegion | BBoxRegion | CircleRegion, Field(discriminator="type")]


class RegionPassRequest(BaseModel):
    region: RegionInput
    from_time: datetime
    horizon_hours: int = 24
    step_seconds: int = 120
    filters: SatelliteFilters | None = None

    @field_validator("horizon_hours")
    @classmethod
    def validate_horizon(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("horizon_hours must be greater than 0")
        return value

    @field_validator("step_seconds")
    @classmethod
    def validate_step(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("step_seconds must be greater than 0")
        return value


class PointPassItem(BaseModel):
    satellite: SatelliteSummary
    next_pass: PassWindow


class PointPassResponse(BaseModel):
    point: PointQuery
    from_time: datetime
    horizon_hours: int
    step_seconds: int
    matches: list[PointPassItem]


class RegionPassWindow(BaseModel):
    enter_time: datetime
    exit_time: datetime
    points_count: int


class RegionPassItem(BaseModel):
    satellite: SatelliteSummary
    windows: list[RegionPassWindow]


class RegionPassResponse(BaseModel):
    from_time: datetime
    horizon_hours: int
    step_seconds: int
    region_type: str
    matches: list[RegionPassItem]


class GroupingBucket(BaseModel):
    value: str
    count: int


class GroupingResponse(BaseModel):
    field: str
    groups: list[GroupingBucket]


class GroupDefinition(BaseModel):
    name: str
    filters: SatelliteFilters = Field(default_factory=SatelliteFilters)


class GroupStatistics(BaseModel):
    name: str
    count: int
    avg_altitude_km: float | None
    avg_period_minutes: float | None
    orbit_type_distribution: dict[str, int]
    country_distribution: dict[str, int]
    operator_distribution: dict[str, int]
    purpose_distribution: dict[str, int]
    satellite_ids: list[int]


class CompareGroupsRequest(BaseModel):
    groups: list[GroupDefinition]

    @field_validator("groups")
    @classmethod
    def validate_groups(cls, value: list[GroupDefinition]) -> list[GroupDefinition]:
        if not value:
            raise ValueError("At least one group must be provided")
        return value


class CompareGroupsResponse(BaseModel):
    groups: list[GroupStatistics]
