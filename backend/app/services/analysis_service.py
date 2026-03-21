from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError
from app.repositories.satellite_repository import SatelliteRepository
from app.schemas.analysis import (
    CompareGroupsRequest,
    CompareGroupsResponse,
    GroupStatistics,
    GroupingBucket,
    GroupingResponse,
    PointPassItem,
    PointPassRequest,
    PointPassResponse,
    RegionPassItem,
    RegionPassRequest,
    RegionPassResponse,
    RegionPassWindow,
)
from app.schemas.satellite import PassWindow, SatelliteSummary
from app.services.propagation_service import PropagationService
from app.utils.region import region_contains
from app.utils.time import ensure_utc


class AnalysisService:
    ALLOWED_GROUP_FIELDS = {"country", "operator", "orbit_type", "purpose"}

    def __init__(self, session: Session):
        self.session = session
        self.repo = SatelliteRepository(session)

    def grouping(self, field: str) -> GroupingResponse:
        if field not in self.ALLOWED_GROUP_FIELDS:
            raise BadRequestError("field must be one of: country, operator, orbit_type, purpose")
        rows = self.repo.group_by_field(field)
        return GroupingResponse(field=field, groups=[GroupingBucket(value=value, count=count) for value, count in rows])

    def passes_over_point(self, request: PointPassRequest) -> PointPassResponse:
        satellites = self.repo.list_all_filtered(**(request.filters.model_dump() if request.filters else {}))
        matches: list[PointPassItem] = []
        for satellite in satellites:
            if not satellite.latest_tle:
                continue
            result = self._next_pass_for_satellite(
                satellite.latest_tle.line1,
                satellite.latest_tle.line2,
                request.lat,
                request.lon,
                request.from_time,
                request.horizon_hours,
                request.step_seconds,
            )
            if result is not None:
                matches.append(PointPassItem(satellite=SatelliteSummary.model_validate(satellite), next_pass=result))
        matches.sort(key=lambda item: item.next_pass.enter_time)
        return PointPassResponse(
            point={"lat": request.lat, "lon": request.lon},
            from_time=ensure_utc(request.from_time),
            horizon_hours=request.horizon_hours,
            step_seconds=request.step_seconds,
            matches=matches,
        )

    def passes_over_region(self, request: RegionPassRequest) -> RegionPassResponse:
        satellites = self.repo.list_all_filtered(**(request.filters.model_dump() if request.filters else {}))
        matches: list[RegionPassItem] = []
        start = ensure_utc(request.from_time)
        end = start + timedelta(hours=request.horizon_hours)
        for satellite in satellites:
            if not satellite.latest_tle:
                continue
            states = PropagationService.ground_track(
                satellite.latest_tle.line1,
                satellite.latest_tle.line2,
                start,
                end,
                request.step_seconds,
            )
            windows: list[RegionPassWindow] = []
            current = None
            points_count = 0
            for state in states:
                geodetic = state["geodetic"]
                inside = region_contains(request.region, geodetic.lat, geodetic.lon)
                if inside and current is None:
                    current = state["timestamp"]
                    points_count = 1
                elif inside and current is not None:
                    points_count += 1
                elif not inside and current is not None:
                    windows.append(
                        RegionPassWindow(
                            enter_time=current,
                            exit_time=state["timestamp"],
                            points_count=points_count,
                        )
                    )
                    current = None
                    points_count = 0
            if current is not None:
                windows.append(
                    RegionPassWindow(
                        enter_time=current,
                        exit_time=states[-1]["timestamp"],
                        points_count=points_count,
                    )
                )
            if windows:
                matches.append(RegionPassItem(satellite=SatelliteSummary.model_validate(satellite), windows=windows))

        matches.sort(key=lambda item: item.windows[0].enter_time)
        return RegionPassResponse(
            from_time=start,
            horizon_hours=request.horizon_hours,
            step_seconds=request.step_seconds,
            region_type=request.region.type,
            matches=matches,
        )

    def compare_groups(self, request: CompareGroupsRequest) -> CompareGroupsResponse:
        result: list[GroupStatistics] = []
        for group in request.groups:
            satellites = self.repo.list_all_filtered(**group.filters.model_dump())
            count = len(satellites)
            avg_altitude = None
            avg_period = None
            if count:
                avg_altitude = sum(item.approx_altitude_km or 0.0 for item in satellites) / count
                avg_period = sum(item.period_minutes or 0.0 for item in satellites) / count
            result.append(
                GroupStatistics(
                    name=group.name,
                    count=count,
                    avg_altitude_km=avg_altitude,
                    avg_period_minutes=avg_period,
                    orbit_type_distribution=self.repo.distribution(satellites, "orbit_type"),
                    country_distribution=self.repo.distribution(satellites, "country"),
                    operator_distribution=self.repo.distribution(satellites, "operator"),
                    purpose_distribution=self.repo.distribution(satellites, "purpose"),
                    satellite_ids=[item.id for item in satellites],
                )
            )
        return CompareGroupsResponse(groups=result)

    def _next_pass_for_satellite(self, line1, line2, lat, lon, from_time, horizon_hours, step_seconds):
        start = ensure_utc(from_time)
        end = start + timedelta(hours=horizon_hours)
        states = PropagationService.ground_track(line1, line2, start, end, step_seconds)
        current = None
        for state in states:
            geodetic = state["geodetic"]
            visible, distance_km = PropagationService.is_point_visible_from_subpoint(
                geodetic.lat, geodetic.lon, geodetic.alt_km, lat, lon
            )
            if visible and current is None:
                current = {
                    "enter_time": state["timestamp"],
                    "exit_time": state["timestamp"],
                    "peak_time": state["timestamp"],
                    "min_distance_km": distance_km,
                    "visible": True,
                }
            elif visible and current is not None:
                current["exit_time"] = state["timestamp"]
                if distance_km < current["min_distance_km"]:
                    current["min_distance_km"] = distance_km
                    current["peak_time"] = state["timestamp"]
            elif not visible and current is not None:
                return PassWindow(**current)
        if current is not None:
            return PassWindow(**current)
        return None
