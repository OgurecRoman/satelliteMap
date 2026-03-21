from __future__ import annotations

from typing import Any

from app.utils.coordinates import haversine_km


def region_payload(region: Any) -> tuple[str, dict]:
    data = region.model_dump()
    return data["type"], data


def region_contains(region: Any, lat: float, lon: float) -> bool:
    region_type = region.type
    if region_type == "bbox":
        return region.min_lat <= lat <= region.max_lat and region.min_lon <= lon <= region.max_lon
    if region_type == "circle":
        return haversine_km(lat, lon, region.center_lat, region.center_lon) <= region.radius_km
    if region_type == "geojson_polygon":
        polygon = region.coordinates[0]
        return point_in_polygon(lon, lat, polygon)
    raise ValueError("Unsupported region type")


def point_in_polygon(x: float, y: float, polygon: list[list[float]]) -> bool:
    inside = False
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        intersects = ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1)
        if intersects:
            inside = not inside
    return inside
