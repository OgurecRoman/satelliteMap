import React, { useState } from 'react';

export default function SubscriptionsPanel2D({
  subscriptions = [],  // ← значение по умолчанию
  selectedPoint,
  selectedSatelliteId,
  activeFilters,
  onCreateSubscription = () => {},
  loading,
}) {
  const [subscriptionForm, setSubscriptionForm] = useState({
    name: 'Оповещение о пролёте',
    target_type: 'point',
    contact_email: '',
    note: '',
    horizon_hours: 6,
    step_seconds: 600,
  });

  const submitSubscription = () => {
    // Проверяем обязательные поля
    if (!subscriptionForm.name.trim()) {
        alert('Введите название подписки');
        return;
    }

    if (subscriptionForm.target_type === 'point' && !selectedPoint) {
        alert('Выберите точку на карте');
        return;
    }

    if (subscriptionForm.contact_email && !subscriptionForm.contact_email.includes('@')) {
        alert('Введите корректный email');
        return;
    }

    const payload = {
        name: subscriptionForm.name,
        target_type: subscriptionForm.target_type,
        satellite_id: selectedSatelliteId || null,
        contact_email: subscriptionForm.contact_email || null,
        note: subscriptionForm.note || null,
        horizon_hours: Number(subscriptionForm.horizon_hours),
        step_seconds: Number(subscriptionForm.step_seconds),
        filters: activeFilters,
    };

    if (subscriptionForm.target_type === 'point' && selectedPoint) {
        payload.point_lat = selectedPoint.lat;
        payload.point_lon = selectedPoint.lon;
    }

    onCreateSubscription(payload);
    setSubscriptionForm({ ...subscriptionForm, name: 'Оповещение о пролёте', contact_email: '', note: '' });
};

  return (
    <div className="subscriptions-panel" style={{ marginTop: '16px' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#61dafb' }}>🔔 Подписки на пролёты</h4>

      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Название подписки"
            value={subscriptionForm.name}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, name: e.target.value })}
            style={{ padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
          />
          <select
            value={subscriptionForm.target_type}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, target_type: e.target.value })}
            style={{ padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
          >
            <option value="point">По точке (выберите на карте)</option>
            <option value="satellite">По спутнику</option>
          </select>
          <input
            type="email"
            placeholder="Email для уведомлений"
            value={subscriptionForm.contact_email}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, contact_email: e.target.value })}
            style={{ padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
          />
          <textarea
            placeholder="Заметка (необязательно)"
            value={subscriptionForm.note}
            rows={2}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, note: e.target.value })}
            style={{ padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
          />
        </div>

        {subscriptionForm.target_type === 'point' && !selectedPoint && (
          <div style={{ fontSize: '0.7rem', color: '#ffaa66', marginBottom: '8px' }}>⚠️ Выберите точку на карте для подписки</div>
        )}

        <button
          onClick={submitSubscription}
          disabled={loading || (subscriptionForm.target_type === 'point' && !selectedPoint)}
          style={{
            width: '100%',
            padding: '8px',
            background: '#61dafb',
            border: 'none',
            borderRadius: '8px',
            color: '#1a1a2e',
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: (loading || (subscriptionForm.target_type === 'point' && !selectedPoint)) ? 0.5 : 1
          }}
        >
          {loading ? 'Создание...' : '➕ Создать подписку'}
        </button>
      </div>

      {subscriptions && subscriptions.length > 0 && (
        <div>
          <div style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '8px' }}>Ваши подписки ({subscriptions.length})</div>
          {subscriptions.slice(0, 5).map((sub) => (
            <div key={sub.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px', marginBottom: '6px', fontSize: '0.7rem' }}>
              <strong>{sub.name}</strong>
              <div>{sub.target_type === 'point' ? '📍 По точке' : '🛰️ По спутнику'}</div>
              <div style={{ color: sub.is_active ? '#61dafb' : '#aaa' }}>{sub.is_active ? 'Активна' : 'Неактивна'}</div>
              {sub.contact_email && <div>📧 {sub.contact_email}</div>}
            </div>
          ))}
        </div>
      )}

      {subscriptions && subscriptions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px', fontSize: '0.7rem', color: '#aaa' }}>
          Нет активных подписок
        </div>
      )}
    </div>
  );
}