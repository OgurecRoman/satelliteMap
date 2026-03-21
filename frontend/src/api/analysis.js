import apiClient from './client';

export async function runPointPassAnalysis(payload) {
  const { data } = await apiClient.post('/analysis/passes-over-point', payload);
  return data;
}

export async function runRegionPassAnalysis(payload) {
  const { data } = await apiClient.post('/analysis/passes-over-region', payload);
  return data;
}

export async function runCompareGroups(payload) {
  const { data } = await apiClient.post('/analysis/compare-groups', payload);
  return data;
}
