import apiClient from './client';

const HEAVY_ANALYSIS_TIMEOUT_MS = 120000;

export async function runPointPassAnalysis(payload) {
  const { data } = await apiClient.post('/analysis/passes-over-point', payload, { timeout: HEAVY_ANALYSIS_TIMEOUT_MS });
  return data;
}

export async function runRegionPassAnalysis(payload) {
  const { data } = await apiClient.post('/analysis/passes-over-region', payload, { timeout: HEAVY_ANALYSIS_TIMEOUT_MS });
  return data;
}

export async function runCompareGroups(payload) {
  const { data } = await apiClient.post('/analysis/compare-groups', payload, { timeout: HEAVY_ANALYSIS_TIMEOUT_MS });
  return data;
}