import * as THREE from 'three';

export const EARTH_RADIUS_UNITS = 2;
const EARTH_RADIUS_KM = 6371;
const EARTH_SCALE = EARTH_RADIUS_UNITS / EARTH_RADIUS_KM;

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
  return new THREE.Vector3(ecef.x * EARTH_SCALE, ecef.y * EARTH_SCALE, ecef.z * EARTH_SCALE);
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
