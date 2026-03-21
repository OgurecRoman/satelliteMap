from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.satellite import (
    AreaFootprintResponse,
    GroundTrackResponse,
    NextPassResponse,
    PositionFormat,
    SatelliteCardResponse,
    SatelliteFiltersResponse,
    SatelliteListResponse,
    SatellitePositionResponse,
    StateVectorResponse,
)
from app.services.satellite_service import SatelliteService

router = APIRouter()


@router.get("", response_model=SatelliteListResponse, summary="List satellites with filters")
def list_satellites(
    country: str | None = None,
    operator: str | None = None,
    orbit_type: str | None = None,
    purpose: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return SatelliteService(db).list_satellites(
        country=country,
        operator=operator,
        orbit_type=orbit_type,
        purpose=purpose,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get("/filters", response_model=SatelliteFiltersResponse, summary="Get available filter values")
def satellite_filters(db: Session = Depends(get_db)):
    return SatelliteService(db).available_filters()


@router.get("/positions", response_model=list[SatellitePositionResponse], summary="Get positions of all satellites")
def satellite_positions(
    timestamp: datetime | None = None,
    country: str | None = None,
    operator: str | None = None,
    orbit_type: str | None = None,
    purpose: str | None = None,
    format: PositionFormat = Query(default=PositionFormat.geodetic),
    db: Session = Depends(get_db),
):
    service = SatelliteService(db)
    items = service.get_positions(
        timestamp=timestamp,
        country=country,
        operator=operator,
        orbit_type=orbit_type,
        purpose=purpose,
        search=None,
    )
    if format == PositionFormat.geodetic:
        for item in items:
            item.ecef = None
            item.eci = None
    elif format == PositionFormat.ecef:
        for item in items:
            item.eci = None
    elif format == PositionFormat.eci:
        for item in items:
            item.ecef = None
    return items


@router.get("/{satellite_id}", response_model=SatelliteCardResponse, summary="Get satellite card")
def get_satellite(
    satellite_id: int,
    timestamp: datetime | None = None,
    point_lat: float | None = Query(default=None),
    point_lon: float | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return SatelliteService(db).get_card(satellite_id, timestamp, point_lat, point_lon)


@router.get("/{satellite_id}/position", response_model=SatellitePositionResponse, summary="Get satellite position")
def get_satellite_position(satellite_id: int, timestamp: datetime | None = None, db: Session = Depends(get_db)):
    return SatelliteService(db).get_position(satellite_id, timestamp)


@router.get("/{satellite_id}/state-vector", response_model=StateVectorResponse, summary="Get state vector")
def get_state_vector(satellite_id: int, timestamp: datetime | None = None, db: Session = Depends(get_db)):
    return SatelliteService(db).get_state_vector(satellite_id, timestamp)


@router.get("/{satellite_id}/track", response_model=GroundTrackResponse, summary="Get ground track")
def get_track(
    satellite_id: int,
    start_time: datetime,
    end_time: datetime,
    step_seconds: int = Query(default=120, gt=0),
    db: Session = Depends(get_db),
):
    return SatelliteService(db).get_track(satellite_id, start_time, end_time, step_seconds)


@router.get("/{satellite_id}/visibility", response_model=AreaFootprintResponse, summary="Get visibility footprint")
def get_visibility(satellite_id: int, timestamp: datetime | None = None, db: Session = Depends(get_db)):
    return SatelliteService(db).get_footprint(satellite_id, timestamp, kind="visibility")


@router.get("/{satellite_id}/coverage", response_model=AreaFootprintResponse, summary="Get coverage footprint")
def get_coverage(satellite_id: int, timestamp: datetime | None = None, db: Session = Depends(get_db)):
    return SatelliteService(db).get_footprint(satellite_id, timestamp, kind="coverage")


@router.get("/{satellite_id}/next-pass", response_model=NextPassResponse, summary="Get next pass over point")
def get_next_pass(
    satellite_id: int,
    lat: float,
    lon: float,
    from_time: datetime | None = None,
    horizon_hours: int = Query(default=24, gt=0),
    step_seconds: int = Query(default=120, gt=0),
    db: Session = Depends(get_db),
):
    return SatelliteService(db).get_next_pass(satellite_id, lat, lon, from_time, horizon_hours, step_seconds)
