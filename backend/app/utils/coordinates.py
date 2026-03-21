from __future__ import annotations

import math
from datetime import datetime

from sgp4.api import jday

from app.utils.time import ensure_utc

EARTH_RADIUS_KM = 6378.137
WGS84_A = 6378.137
WGS84_F = 1 / 298.257223563
WGS84_B = WGS84_A * (1 - WGS84_F)
WGS84_E2 = 1 - (WGS84_B**2 / WGS84_A**2)
EARTH_ROTATION_RAD_S = 7.2921150e-5


def vector_norm(vector: tuple[float, float, float]) -> float:
    return math.sqrt(sum(component * component for component in vector))


def gmst_radians(timestamp: datetime) -> float:
    timestamp = ensure_utc(timestamp)
    jd, fr = jday(
        timestamp.year,
        timestamp.month,
        timestamp.day,
        timestamp.hour,
        timestamp.minute,
        timestamp.second + timestamp.microsecond / 1_000_000,
    )
    t = ((jd - 2451545.0) + fr) / 36525.0
    gmst_deg = (
        280.46061837
        + 360.98564736629 * ((jd - 2451545.0) + fr)
        + 0.000387933 * t * t
        - (t * t * t) / 38710000.0
    ) % 360.0
    return math.radians(gmst_deg)


def rotate_z(vector: tuple[float, float, float], angle_rad: float) -> tuple[float, float, float]:
    x, y, z = vector
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    return (cos_a * x + sin_a * y, -sin_a * x + cos_a * y, z)


def teme_to_ecef(position_eci: tuple[float, float, float], timestamp: datetime) -> tuple[float, float, float]:
    gmst = gmst_radians(timestamp)
    return rotate_z(position_eci, gmst)


def teme_velocity_to_ecef(
    position_eci: tuple[float, float, float],
    velocity_eci: tuple[float, float, float],
    timestamp: datetime,
) -> tuple[float, float, float]:
    gmst = gmst_radians(timestamp)
    r_ecef = rotate_z(position_eci, gmst)
    v_rot = rotate_z(velocity_eci, gmst)
    omega_cross_r = (-EARTH_ROTATION_RAD_S * r_ecef[1], EARTH_ROTATION_RAD_S * r_ecef[0], 0.0)
    return (
        v_rot[0] - omega_cross_r[0],
        v_rot[1] - omega_cross_r[1],
        v_rot[2] - omega_cross_r[2],
    )


def ecef_to_geodetic(position_ecef: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = position_ecef
    lon = math.atan2(y, x)
    p = math.sqrt(x * x + y * y)
    lat = math.atan2(z, p * (1 - WGS84_E2))

    for _ in range(6):
        sin_lat = math.sin(lat)
        n = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)
        alt = p / math.cos(lat) - n
        lat = math.atan2(z, p * (1 - WGS84_E2 * n / (n + alt)))

    sin_lat = math.sin(lat)
    n = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)
    alt = p / math.cos(lat) - n
    return math.degrees(lat), normalize_longitude(math.degrees(lon)), alt


def normalize_longitude(lon_deg: float) -> float:
    value = ((lon_deg + 180.0) % 360.0) - 180.0
    if value == -180.0:
        return 180.0
    return value


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def central_angle_rad(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    value = math.sin(phi1) * math.sin(phi2) + math.cos(phi1) * math.cos(phi2) * math.cos(dlambda)
    return math.acos(max(-1.0, min(1.0, value)))


def horizon_angular_radius_rad(alt_km: float) -> float:
    alt = max(0.0, alt_km)
    ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + alt)
    ratio = max(-1.0, min(1.0, ratio))
    return math.acos(ratio)


def arc_length_from_angle(angle_rad: float) -> float:
    return EARTH_RADIUS_KM * angle_rad


def spherical_circle_polygon(
    center_lat: float,
    center_lon: float,
    angular_radius_rad: float,
    points: int = 72,
) -> list[list[float]]:
    lat1 = math.radians(center_lat)
    lon1 = math.radians(center_lon)
    result: list[list[float]] = []
    for i in range(points):
        bearing = 2 * math.pi * i / points
        lat2 = math.asin(
            math.sin(lat1) * math.cos(angular_radius_rad)
            + math.cos(lat1) * math.sin(angular_radius_rad) * math.cos(bearing)
        )
        lon2 = lon1 + math.atan2(
            math.sin(bearing) * math.sin(angular_radius_rad) * math.cos(lat1),
            math.cos(angular_radius_rad) - math.sin(lat1) * math.sin(lat2),
        )
        result.append([normalize_longitude(math.degrees(lon2)), math.degrees(lat2)])
    result.append(result[0])
    return result
