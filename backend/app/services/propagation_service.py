from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from sgp4.api import Satrec, jday

from app.core.exceptions import BadRequestError
from app.schemas.satellite import CartesianCoordinates, GeodeticCoordinates, VelocityVector
from app.utils.coordinates import (
    arc_length_from_angle,
    central_angle_rad,
    ecef_to_geodetic,
    horizon_angular_radius_rad,
    spherical_circle_polygon,
    teme_to_ecef,
    teme_velocity_to_ecef,
    vector_norm,
)
from app.utils.time import ensure_utc, iter_time_range

MU_EARTH = 398600.4418
EARTH_RADIUS_KM = 6378.137


class PropagationService:
    @staticmethod
    @lru_cache(maxsize=2048)
    def _satrec(line1: str, line2: str) -> Satrec:
        return Satrec.twoline2rv(line1, line2)

    @classmethod
    def propagate(cls, line1: str, line2: str, timestamp: datetime) -> dict:
        timestamp = ensure_utc(timestamp)
        sat = cls._satrec(line1, line2)
        jd, fr = jday(
            timestamp.year,
            timestamp.month,
            timestamp.day,
            timestamp.hour,
            timestamp.minute,
            timestamp.second + timestamp.microsecond / 1_000_000,
        )
        error_code, position_eci, velocity_eci = sat.sgp4(jd, fr)
        if error_code != 0:
            raise BadRequestError(f"TLE propagation failed with SGP4 error code {error_code}")

        position_eci_tuple = tuple(float(value) for value in position_eci)
        velocity_eci_tuple = tuple(float(value) for value in velocity_eci)
        position_ecef = teme_to_ecef(position_eci_tuple, timestamp)
        velocity_ecef = teme_velocity_to_ecef(position_eci_tuple, velocity_eci_tuple, timestamp)
        lat, lon, alt = ecef_to_geodetic(position_ecef)

        return {
            "timestamp": timestamp,
            "geodetic": GeodeticCoordinates(lat=lat, lon=lon, alt_km=alt),
            "eci": CartesianCoordinates(x=position_eci_tuple[0], y=position_eci_tuple[1], z=position_eci_tuple[2]),
            "ecef": CartesianCoordinates(x=position_ecef[0], y=position_ecef[1], z=position_ecef[2]),
            "velocity_eci": VelocityVector(
                vx=velocity_eci_tuple[0],
                vy=velocity_eci_tuple[1],
                vz=velocity_eci_tuple[2],
                speed_km_s=vector_norm(velocity_eci_tuple),
            ),
            "velocity_ecef": VelocityVector(
                vx=velocity_ecef[0],
                vy=velocity_ecef[1],
                vz=velocity_ecef[2],
                speed_km_s=vector_norm(velocity_ecef),
            ),
        }

    @staticmethod
    def tle_epoch(line1: str, line2: str) -> datetime:
        sat = Satrec.twoline2rv(line1, line2)
        year = sat.epochyr
        full_year = 1900 + year if year >= 57 else 2000 + year
        epoch = datetime(full_year, 1, 1, tzinfo=timezone.utc) + timedelta(days=sat.epochdays - 1)
        return epoch

    @staticmethod
    def orbital_period_minutes(line2: str) -> float:
        mean_motion = float(line2[52:63])
        return 1440.0 / mean_motion

    @staticmethod
    def semi_major_axis_km(line2: str) -> float:
        mean_motion = float(line2[52:63])
        mean_motion_rad_s = mean_motion * 2 * math.pi / 86400.0
        return (MU_EARTH / (mean_motion_rad_s**2)) ** (1 / 3)

    @classmethod
    def approx_altitude_km(cls, line2: str) -> float:
        return cls.semi_major_axis_km(line2) - EARTH_RADIUS_KM

    @staticmethod
    def eccentricity(line2: str) -> float:
        return float(f"0.{line2[26:33].strip()}")

    @classmethod
    def determine_orbit_type(cls, line2: str) -> str:
        altitude = cls.approx_altitude_km(line2)
        period = cls.orbital_period_minutes(line2)
        eccentricity = cls.eccentricity(line2)
        if 35000 <= altitude <= 37000 and 1300 <= period <= 1500:
            return "GEO"
        if eccentricity > 0.25:
            return "HEO"
        if altitude < 2000:
            return "LEO"
        if altitude < 35000:
            return "MEO"
        return "HEO"

    @classmethod
    def visibility_angular_radius_rad(cls, altitude_km: float) -> float:
        return horizon_angular_radius_rad(altitude_km)

    @classmethod
    def coverage_angular_radius_rad(cls, altitude_km: float) -> float:
        return cls.visibility_angular_radius_rad(altitude_km) * 0.75

    @classmethod
    def is_point_visible_from_subpoint(
        cls,
        subsat_lat: float,
        subsat_lon: float,
        altitude_km: float,
        target_lat: float,
        target_lon: float,
    ) -> tuple[bool, float]:
        angle = central_angle_rad(subsat_lat, subsat_lon, target_lat, target_lon)
        threshold = cls.visibility_angular_radius_rad(altitude_km)
        return angle <= threshold, arc_length_from_angle(angle)

    @classmethod
    def build_footprint_polygon(
        cls, center_lat: float, center_lon: float, altitude_km: float, kind: str, points: int = 72
    ) -> tuple[float, float, list[list[float]]]:
        if kind == "visibility":
            angle = cls.visibility_angular_radius_rad(altitude_km)
        elif kind == "coverage":
            angle = cls.coverage_angular_radius_rad(altitude_km)
        else:
            raise ValueError("Unsupported footprint kind")
        radius_km = arc_length_from_angle(angle)
        polygon = spherical_circle_polygon(center_lat, center_lon, angle, points=points)
        return math.degrees(angle), radius_km, polygon

    @classmethod
    def ground_track(cls, line1: str, line2: str, start_time: datetime, end_time: datetime, step_seconds: int) -> list[dict]:
        if step_seconds <= 0:
            raise BadRequestError("step_seconds must be greater than 0")
        if ensure_utc(end_time) < ensure_utc(start_time):
            raise BadRequestError("end_time must be greater than or equal to start_time")
        points = []
        for current in iter_time_range(start_time, end_time, step_seconds):
            state = cls.propagate(line1, line2, current)
            points.append(state)
        return points
