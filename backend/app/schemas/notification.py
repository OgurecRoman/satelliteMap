from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.analysis import RegionInput, SatelliteFilters


class NotificationSubscriptionCreateRequest(BaseModel):
    name: str
    target_type: str = Field(description="point or region")
    satellite_id: int | None = None
    point_lat: float | None = None
    point_lon: float | None = None
    region: RegionInput | None = None
    filters: SatelliteFilters | None = None
    contact_email: str | None = None
    note: str | None = None
    horizon_hours: int = 24
    step_seconds: int = 120

    @model_validator(mode="after")
    def validate_target(self) -> "NotificationSubscriptionCreateRequest":
        if self.horizon_hours <= 0:
            raise ValueError("horizon_hours must be greater than 0")
        if self.step_seconds <= 0:
            raise ValueError("step_seconds must be greater than 0")
        if self.target_type == "point":
            if self.point_lat is None or self.point_lon is None:
                raise ValueError("point_lat and point_lon are required for point subscriptions")
            if not -90 <= self.point_lat <= 90 or not -180 <= self.point_lon <= 180:
                raise ValueError("Invalid point coordinates")
        elif self.target_type == "region":
            if self.region is None:
                raise ValueError("region is required for region subscriptions")
        else:
            raise ValueError("target_type must be either 'point' or 'region'")
        return self


class NotificationSubscriptionResponse(BaseModel):
    id: int
    name: str
    target_type: str
    satellite_id: int | None
    point_lat: float | None
    point_lon: float | None
    region_type: str | None
    region_payload: dict | None
    filters_json: dict | None
    contact_email: str | None
    note: str | None
    horizon_hours: int
    step_seconds: int
    next_event_time: datetime | None
    last_checked_at: datetime | None
    is_active: bool
    created_at: datetime
