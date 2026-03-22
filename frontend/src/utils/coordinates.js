import * as THREE from 'three';

export const EARTH_RADIUS_UNITS = 2;
const EARTH_RADIUS_KM = 6378.137;
const EARTH_SCALE = EARTH_RADIUS_UNITS / EARTH_RADIUS_KM;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = EARTH_RADIUS_KM * (1 - WGS84_F);
const WGS84_E2 = 1 - (WGS84_B * WGS84_B) / (EARTH_RADIUS_KM * EARTH_RADIUS_KM);

export function latLonAltToVector3(lat, lon, altKm = 0, radius = EARTH_RADIUS_UNITS) {
  const radialDistance = radius * (1 + altKm / EARTH_RADIUS_KM);
  const latRad = THREE.MathUtils.degToRad(lat);
  const lonRad = THREE.MathUtils.degToRad(lon);

  return new THREE.Vector3(
    radialDistance * Math.cos(latRad) * Math.sin(lonRad),
    radialDistance * Math.sin(latRad),
    radialDistance * Math.cos(latRad) * Math.cos(lonRad)
  );
}

export function ecefToVector3(ecef) {
  if (!ecef) return null;
  return new THREE.Vector3(
    ecef.y * EARTH_SCALE,
    ecef.z * EARTH_SCALE,
    ecef.x * EARTH_SCALE
  );
}

export function extrapolateEcef(position, currentTime) {
  if (!position?.ecef) return null;
  const baseTime = new Date(position.timestamp).getTime();
  const targetTime = currentTime instanceof Date ? currentTime.getTime() : new Date(currentTime).getTime();
  const dtSeconds = Number.isFinite(baseTime) && Number.isFinite(targetTime) ? (targetTime - baseTime) / 1000 : 0;

  if (!position.velocity_ecef) {
    return { ...position.ecef };
  }

  return {
    x: position.ecef.x + position.velocity_ecef.vx * dtSeconds,
    y: position.ecef.y + position.velocity_ecef.vy * dtSeconds,
    z: position.ecef.z + position.velocity_ecef.vz * dtSeconds,
  };
}

export function extrapolatePositionToVector3(position, currentTime) {
  const ecef = extrapolateEcef(position, currentTime);
  if (ecef) return ecefToVector3(ecef);
  if (position?.geodetic) return latLonAltToVector3(position.geodetic.lat, position.geodetic.lon, position.geodetic.alt_km);
  return null;
}

export function vector3ToLatLon(vector) {
  const normalized = vector.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(normalized.x, normalized.z));
  return { lat, lon };
}

export function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

export function formatCompactNumber(value, fractionDigits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(fractionDigits) : '—';
}

export function ecefToLatLonAlt(ecef) {
  if (!ecef) return null;

  const { x, y, z } = ecef;
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - WGS84_E2));
  let alt = 0;

  for (let i = 0; i < 6; i += 1) {
    const sinLat = Math.sin(lat);
    const n = EARTH_RADIUS_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    alt = p / Math.max(Math.cos(lat), 1e-9) - n;
    lat = Math.atan2(z, p * (1 - (WGS84_E2 * n) / Math.max(n + alt, 1e-9)));
  }

  const sinLat = Math.sin(lat);
  const n = EARTH_RADIUS_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  alt = p / Math.max(Math.cos(lat), 1e-9) - n;

  return {
    lat: THREE.MathUtils.radToDeg(lat),
    lon: THREE.MathUtils.radToDeg(lon),
    alt_km: alt,
  };
}

export function currentGeodeticFromPosition(position, currentTime) {
  if (!position) return null;
  if (position.geodetic && !position.ecef) return position.geodetic;
  const ecef = extrapolateEcef(position, currentTime);
  return ecef ? ecefToLatLonAlt(ecef) : position.geodetic || null;
}

export function horizonAngularRadiusDeg(altKm = 0) {
  const ratio = THREE.MathUtils.clamp(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(0, altKm)), -1, 1);
  return THREE.MathUtils.radToDeg(Math.acos(ratio));
}

export function minElevationAngularRadiusDeg(altKm = 0, minElevationDeg = 15) {
  const altitudeKm = Math.max(0, altKm);
  const elevationRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(minElevationDeg, 0, 89));
  const ratio = THREE.MathUtils.clamp((EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm)) * Math.cos(elevationRad), -1, 1);
  const centralAngleRad = Math.max(0, Math.acos(ratio) - elevationRad);
  return THREE.MathUtils.radToDeg(centralAngleRad);
}

export function footprintAngularRadiusDeg(altKm = 0, kind = 'visibility', minElevationDeg = 15) {
  if (kind === 'min_elevation') {
    return minElevationAngularRadiusDeg(altKm, minElevationDeg);
  }
  return horizonAngularRadiusDeg(altKm);
}

export function surfaceRadiusKmFromAngularRadiusDeg(angularRadiusDeg = 0) {
  return Number.isFinite(angularRadiusDeg) ? EARTH_RADIUS_KM * THREE.MathUtils.degToRad(Math.max(0, angularRadiusDeg)) : null;
}

function normalizeLongitude(lon) {
  const value = ((lon + 180) % 360 + 360) % 360 - 180;
  return value === -180 ? 180 : value;
}

export function sphericalCirclePolygon(centerLat, centerLon, angularRadiusDeg, points = 72) {
  const lat1 = THREE.MathUtils.degToRad(centerLat);
  const lon1 = THREE.MathUtils.degToRad(centerLon);
  const angularRadiusRad = THREE.MathUtils.degToRad(angularRadiusDeg);
  const result = [];

  for (let i = 0; i < points; i += 1) {
    const bearing = (2 * Math.PI * i) / points;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularRadiusRad)
      + Math.cos(lat1) * Math.sin(angularRadiusRad) * Math.cos(bearing)
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angularRadiusRad) * Math.cos(lat1),
      Math.cos(angularRadiusRad) - Math.sin(lat1) * Math.sin(lat2)
    );
    result.push([normalizeLongitude(THREE.MathUtils.radToDeg(lon2)), THREE.MathUtils.radToDeg(lat2)]);
  }

  if (result.length) result.push(result[0]);
  return result;
}
