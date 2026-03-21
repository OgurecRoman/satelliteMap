from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class TLERecordBrief(ORMModel):
    id: int
    satellite_id: int
    satellite_name: str
    norad_id: str
    source: str
    epoch: datetime | None
    is_active: bool
    checksum_valid: bool


class TLEUploadResult(BaseModel):
    created_satellites: int
    updated_satellites: int
    created_tle_records: int
    invalid_entries: list[str] = Field(default_factory=list)


class TLEUpdateRequest(BaseModel):
    line1: str
    line2: str
    source: str = "manual_update"


class TLEUpdateResponse(BaseModel):
    satellite_id: int
    satellite_name: str
    tle_record_id: int
    epoch: datetime | None
    orbit_type: str
    approx_altitude_km: float | None
    period_minutes: float | None
