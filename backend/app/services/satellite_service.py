from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.repositories.satellite_repository import SatelliteRepository
from app.schemas.satellite import (
    AreaFootprintResponse,
    GeoJSONPolygon,
    GroundTrackPoint,
    GroundTrackResponse,
    NextPassResponse,
    PassWindow,
    PointQuery,
    SatelliteCardResponse,
    SatelliteFiltersResponse,
    SatelliteListResponse,
    SatellitePositionResponse,
    SatelliteSummary,
    StateVectorResponse,
)
from app.services.propagation_service import PropagationService
from app.utils.time import ensure_utc


class SatelliteService:
    PROPAGATION_FAILURE_PREFIX = "TLE propagation failed"
    INVALID_TIME_MESSAGE = "Для выбранного времени не удалось рассчитать орбиту по текущему TLE."

    def __init__(self, session: Session):
        self.session = session
        self.repo = SatelliteRepository(session)
        self.settings = get_settings()

    def list_satellites(
        self,
        *,
        country: str | None,
        operator: str | None,
        orbit_type: str | None,
        purpose: str | None,
        search: str | None,
        limit: int,
        offset: int,
    ) -> SatelliteListResponse:
        satellites = self.repo.list_filtered(
            country=country,
            operator=operator,
            orbit_type=orbit_type,
            purpose=purpose,
            search=search,
            limit=limit,
            offset=offset,
        )
        total = self.repo.count_filtered(
            country=country,
            operator=operator,
            orbit_type=orbit_type,
            purpose=purpose,
            search=search,
        )
        return SatelliteListResponse(
            total=total,
            limit=limit,
            offset=offset,
            items=[SatelliteSummary.model_validate(item) for item in satellites],
        )

    def available_filters(self) -> SatelliteFiltersResponse:
        return SatelliteFiltersResponse(**self.repo.available_filters())

    def get_satellite(self, satellite_id: int):
        satellite = self.repo.get(satellite_id)
        if not satellite or not satellite.latest_tle:
            raise NotFoundError("Satellite not found")
        return satellite

    def get_position(self, satellite_id: int, timestamp: datetime | None) -> SatellitePositionResponse:
        satellite = self.get_satellite(satellite_id)
        try:
            state = PropagationService.propagate(satellite.latest_tle.line1, satellite.latest_tle.line2, ensure_utc(timestamp))
        except BadRequestError as exc:
            self._raise_if_propagation_failure(exc)
            raise
        return SatellitePositionResponse(
            satellite_id=satellite.id,
            satellite_name=satellite.name,
            timestamp=state["timestamp"],
            geodetic=state["geodetic"],
            ecef=state["ecef"],
            eci=state["eci"],
            velocity=state["velocity_eci"],
            velocity_ecef=state["velocity_ecef"],
        )

    def get_positions(self, timestamp: datetime | None, **filters) -> list[SatellitePositionResponse]:
        timestamp_utc = ensure_utc(timestamp)
        rows = self.repo.list_position_rows_filtered(**filters)
        result: list[SatellitePositionResponse] = []
        append = result.append
        for satellite_id, satellite_name, line1, line2 in rows:
            try:
                state = PropagationService.propagate_bulk(line1, line2, timestamp_utc)
            except BadRequestError as exc:
                if self._is_propagation_failure(exc):
                    continue
                raise
            append(
                SatellitePositionResponse(
                    satellite_id=satellite_id,
                    satellite_name=satellite_name,
                    timestamp=state["timestamp"],
                    geodetic=state["geodetic"],
                    ecef=state["ecef"],
                    eci=state["eci"],
                    velocity=state["velocity_eci"],
                    velocity_ecef=state["velocity_ecef"],
                )
            )
        return result

    def get_card(self, satellite_id: int, timestamp: datetime | None, point_lat: float | None, point_lon: float | None):
        satellite = self.get_satellite(satellite_id)
        current_position = self.get_position(satellite_id, timestamp)
        next_pass = None
        if point_lat is not None and point_lon is not None:
            next_pass_response = self.get_next_pass(
                satellite_id=satellite_id,
                lat=point_lat,
                lon=point_lon,
                from_time=timestamp,
                horizon_hours=self.settings.default_horizon_hours,
                step_seconds=self.settings.default_step_seconds,
            )
            next_pass = next_pass_response.next_pass
        return SatelliteCardResponse(
            **SatelliteSummary.model_validate(satellite).model_dump(),
            latest_tle_epoch=satellite.latest_tle.epoch,
            current_position=current_position,
            next_pass_over_point=next_pass,
        )

    def get_state_vector(self, satellite_id: int, timestamp: datetime | None) -> StateVectorResponse:
        satellite = self.get_satellite(satellite_id)
        try:
            state = PropagationService.propagate(satellite.latest_tle.line1, satellite.latest_tle.line2, ensure_utc(timestamp))
        except BadRequestError as exc:
            self._raise_if_propagation_failure(exc)
            raise
        return StateVectorResponse(
            satellite_id=satellite.id,
            satellite_name=satellite.name,
            timestamp=state["timestamp"],
            geodetic=state["geodetic"],
            eci=state["eci"],
            ecef=state["ecef"],
            velocity_eci=state["velocity_eci"],
            velocity_ecef=state["velocity_ecef"],
        )

    def get_track(self, satellite_id: int, start_time: datetime, end_time: datetime, step_seconds: int) -> GroundTrackResponse:
        satellite = self.get_satellite(satellite_id)
        try:
            states = PropagationService.ground_track(satellite.latest_tle.line1, satellite.latest_tle.line2, start_time, end_time, step_seconds)
        except BadRequestError as exc:
            self._raise_if_propagation_failure(exc)
            raise
        return GroundTrackResponse(
            satellite_id=satellite.id,
            satellite_name=satellite.name,
            start_time=ensure_utc(start_time),
            end_time=ensure_utc(end_time),
            step_seconds=step_seconds,
            points=[
                GroundTrackPoint(
                    timestamp=state["timestamp"],
                    geodetic=state["geodetic"],
                    ecef=state["ecef"],
                )
                for state in states
            ],
        )

    def get_footprint(self, satellite_id: int, timestamp: datetime | None, kind: str) -> AreaFootprintResponse:
        satellite = self.get_satellite(satellite_id)
        try:
            state = PropagationService.propagate(satellite.latest_tle.line1, satellite.latest_tle.line2, ensure_utc(timestamp))
        except BadRequestError as exc:
            self._raise_if_propagation_failure(exc)
            raise
        angular_radius_deg, radius_km, polygon = PropagationService.build_footprint_polygon(
            state["geodetic"].lat,
            state["geodetic"].lon,
            state["geodetic"].alt_km,
            kind=kind,
            points=self.settings.visibility_polygon_points,
        )
        if kind == "visibility":
            model = "radio_horizon"
            note = "Visibility approximates the radio horizon footprint from satellite altitude using a spherical Earth model."
        else:
            model = "service_footprint"
            note = "Coverage uses a narrower service footprint approximation than visibility in this MVP (75% of the radio horizon angle)."
        return AreaFootprintResponse(
            satellite_id=satellite.id,
            satellite_name=satellite.name,
            timestamp=state["timestamp"],
            center=state["geodetic"],
            radius_km=radius_km,
            angular_radius_deg=angular_radius_deg,
            polygon=GeoJSONPolygon(coordinates=[polygon]),
            model=model,
            note=note,
        )

    def get_next_pass(
        self,
        satellite_id: int,
        lat: float,
        lon: float,
        from_time: datetime | None,
        horizon_hours: int,
        step_seconds: int,
    ) -> NextPassResponse:
        if not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise BadRequestError("Invalid point coordinates")
        if horizon_hours <= 0:
            raise BadRequestError("horizon_hours must be greater than 0")
        if step_seconds <= 0:
            raise BadRequestError("step_seconds must be greater than 0")

        satellite = self.get_satellite(satellite_id)
        start = ensure_utc(from_time)
        end = start.replace(microsecond=0) + timedelta(hours=horizon_hours)
        try:
            states = PropagationService.ground_track(satellite.latest_tle.line1, satellite.latest_tle.line2, start, end, step_seconds)
        except BadRequestError as exc:
            self._raise_if_propagation_failure(exc)
            raise

        current_window = None
        windows: list[PassWindow] = []
        for state in states:
            geodetic = state["geodetic"]
            visible, distance_km = PropagationService.is_point_visible_from_subpoint(
                geodetic.lat,
                geodetic.lon,
                geodetic.alt_km,
                lat,
                lon,
            )
            if visible and current_window is None:
                current_window = {
                    "enter_time": state["timestamp"],
                    "exit_time": state["timestamp"],
                    "peak_time": state["timestamp"],
                    "min_distance_km": distance_km,
                    "visible": True,
                }
            elif visible and current_window is not None:
                current_window["exit_time"] = state["timestamp"]
                if distance_km < current_window["min_distance_km"]:
                    current_window["min_distance_km"] = distance_km
                    current_window["peak_time"] = state["timestamp"]
            elif not visible and current_window is not None:
                windows.append(PassWindow(**current_window))
                current_window = None

        if current_window is not None:
            windows.append(PassWindow(**current_window))

        return NextPassResponse(
            satellite_id=satellite.id,
            satellite_name=satellite.name,
            query_point=PointQuery(lat=lat, lon=lon),
            from_time=start,
            horizon_hours=horizon_hours,
            step_seconds=step_seconds,
            next_pass=windows[0] if windows else None,
        )

    def _raise_if_propagation_failure(self, exc: BadRequestError) -> None:
        if self._is_propagation_failure(exc):
            raise BadRequestError(self.INVALID_TIME_MESSAGE) from exc

    def _is_propagation_failure(self, exc: BadRequestError) -> bool:
        return isinstance(exc.detail, str) and exc.detail.startswith(self.PROPAGATION_FAILURE_PREFIX)
