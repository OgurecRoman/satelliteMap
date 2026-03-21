import * as THREE from 'three';

export const EARTH_RADIUS_UNITS = 2;
const EARTH_RADIUS_KM = 6371;

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

export function vector3ToLatLon(vector) {
  const normalized = vector.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(normalized.x, normalized.z));
  return { lat, lon };
}

export function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}
