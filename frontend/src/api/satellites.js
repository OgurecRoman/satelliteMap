import apiClient from './client';

const cleanParams = (params = {}) => {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
};

export async function getSatelliteFilters() {
  const { data } = await apiClient.get('/satellites/filters');
  return data;
}

export async function getSatellites(params = {}) {
  const { data } = await apiClient.get('/satellites', {
    params: cleanParams({ limit: 500, offset: 0, ...params }),
  });
  return data;
}

export async function getSatellitePositions(params = {}) {
  const { data } = await apiClient.get('/satellites/positions', {
    params: cleanParams({ format: 'ecef', ...params }),
    timeout: 60000,
  });
  return data;
}

export async function getSatelliteCard(satelliteId, params = {}) {
  const { data } = await apiClient.get(`/satellites/${satelliteId}`, {
    params: cleanParams(params),
  });
  return data;
}

export async function getSatelliteTrack(satelliteId, params = {}) {
  const { data } = await apiClient.get(`/satellites/${satelliteId}/track`, {
    params: cleanParams(params),
  });
  return data;
}

export async function getSatelliteVisibility(satelliteId, params = {}) {
  const { data } = await apiClient.get(`/satellites/${satelliteId}/visibility`, {
    params: cleanParams(params),
  });
  return data;
}

export async function getSatelliteCoverage(satelliteId, params = {}) {
  const { data } = await apiClient.get(`/satellites/${satelliteId}/coverage`, {
    params: cleanParams(params),
  });
  return data;
}

export async function getSatelliteNextPass(satelliteId, params = {}) {
  const { data } = await apiClient.get(`/satellites/${satelliteId}/next-pass`, {
    params: cleanParams(params),
  });
  return data;
}
