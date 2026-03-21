from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel


class OrbitTypeEnum(str, Enum):
    LEO = "LEO"
    MEO = "MEO"
    GEO = "GEO"
    HEO = "HEO"
    UNKNOWN = "UNKNOWN"


class PositionFormat(str, Enum):
    geodetic = "geodetic"
    ecef = "ecef"
    eci = "eci"


class GeodeticCoordinates(BaseModel):
    lat: float
    lon: float
    alt_km: float


class CartesianCoordinates(BaseModel):
    x: float
    y: float
    z: float


class VelocityVector(BaseModel):
    vx: float
    vy: float
    vz: float
    speed_km_s: float


class PointQuery(BaseModel):
    lat: float
    lon: float

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


class SatelliteSummary(ORMModel):
    id: int
    name: str
    norad_id: str
    country: str
    operator: str
    orbit_type: str
    purpose: str
    approx_altitude_km: float | None
    period_minutes: float | None


class SatelliteListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[SatelliteSummary]


class SatelliteFiltersResponse(BaseModel):
    countries: list[str]
    operators: list[str]
    orbit_types: list[str]
    purposes: list[str]


class PassWindow(BaseModel):
    enter_time: datetime
    exit_time: datetime
    peak_time: datetime
    min_distance_km: float
    visible: bool


class SatellitePositionResponse(BaseModel):
    satellite_id: int
    satellite_name: str
    timestamp: datetime
    geodetic: GeodeticCoordinates | None = None
    ecef: CartesianCoordinates | None = None
    eci: CartesianCoordinates | None = None
    velocity: VelocityVector


class SatelliteCardResponse(SatelliteSummary):
    latest_tle_epoch: datetime | None
    current_position: SatellitePositionResponse
    next_pass_over_point: PassWindow | None = None


class GroundTrackPoint(BaseModel):
    timestamp: datetime
    geodetic: GeodeticCoordinates


class GroundTrackResponse(BaseModel):
    satellite_id: int
    satellite_name: str
    start_time: datetime
    end_time: datetime
    step_seconds: int
    points: list[GroundTrackPoint]


class GeoJSONPolygon(BaseModel):
    type: str = "Polygon"
    coordinates: list[list[list[float]]]


class AreaFootprintResponse(BaseModel):
    satellite_id: int
    satellite_name: str
    timestamp: datetime
    center: GeodeticCoordinates
    radius_km: float
    angular_radius_deg: float
    polygon: GeoJSONPolygon
    model: str
    note: str


class NextPassResponse(BaseModel):
    satellite_id: int
    satellite_name: str
    query_point: PointQuery
    from_time: datetime
    horizon_hours: int
    step_seconds: int
    next_pass: PassWindow | None


class StateVectorResponse(BaseModel):
    satellite_id: int
    satellite_name: str
    timestamp: datetime
    geodetic: GeodeticCoordinates
    eci: CartesianCoordinates
    ecef: CartesianCoordinates
    velocity_eci: VelocityVector
    velocity_ecef: VelocityVector


class SimulationRequest(BaseModel):
    start_time: datetime
    end_time: datetime
    step_seconds: int = Field(default=120, gt=0)

    @model_validator(mode="after")
    def validate_window(self) -> "SimulationRequest":
        if self.end_time < self.start_time:
            raise ValueError("end_time must be greater than or equal to start_time")
        return self
