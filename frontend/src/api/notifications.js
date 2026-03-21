import apiClient from './client';

export async function listSubscriptions() {
  const { data } = await apiClient.get('/notifications/subscriptions');
  return data;
}

export async function createSubscription(payload) {
  const { data } = await apiClient.post('/notifications/subscriptions', payload);
  return data;
}
