import React, { useState, useEffect } from 'react';
import { formatTimestamp } from '../utils/time';

const DEFAULT_REGION = { min_lat: 50, min_lon: 30, max_lat: 60, max_lon: 40 };
const DEFAULT_GROUP_A = { name: 'Группа A', country: '', operator: '', orbit_type: 'LEO', purpose: '' };
const DEFAULT_GROUP_B = { name: 'Группа B', country: '', operator: '', orbit_type: '', purpose: 'Earth observation' };

export default function AnalysisPanel2D({
  currentTime,
  selectedPoint,
  selectedSatelliteId,
  activeFilters,
  onRunPointAnalysis,
  onRunRegionAnalysis,
  onRunCompareGroups,
  filterOptions,
  results,
  loading,
  error,
}) {
  const [pointForm, setPointForm] = useState({ lat: 55.75, lon: 37.62, horizon_hours: 6, step_seconds: 600 });
  const [regionForm, setRegionForm] = useState({ ...DEFAULT_REGION, horizon_hours: 6, step_seconds: 900 });
  const [groupA, setGroupA] = useState(DEFAULT_GROUP_A);
  const [groupB, setGroupB] = useState(DEFAULT_GROUP_B);
  const [activeTab, setActiveTab] = useState('point');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (selectedPoint && selectedPoint.lat !== undefined && selectedPoint.lon !== undefined) {
      setPointForm((prev) => ({
        ...prev,
        lat: Number(selectedPoint.lat.toFixed(4)),
        lon: Number(selectedPoint.lon.toFixed(4)),
      }));
    }
  }, [selectedPoint]);

  // Валидация координат
  const validateCoordinates = (lat, lon) => {
    if (lat < -90 || lat > 90) return 'Широта должна быть в диапазоне от -90 до 90';
    if (lon < -180 || lon > 180) return 'Долгота должна быть в диапазоне от -180 до 180';
    return null;
  };

  // Валидация региона
  const validateRegion = (minLat, maxLat, minLon, maxLon) => {
    if (minLat < -90 || maxLat > 90 || minLat > maxLat) return 'Некорректные границы широты';
    if (minLon < -180 || maxLon > 180 || minLon > maxLon) return 'Некорректные границы долготы';
    return null;
  };

  const buildFilters = (group) => Object.fromEntries(
    Object.entries({
      country: group.country,
      operator: group.operator,
      orbit_type: group.orbit_type,
      purpose: group.purpose,
    }).filter(([, value]) => value)
  );

  const submitPointAnalysis = () => {
    setLocalError('');

    const lat = Number(pointForm.lat);
    const lon = Number(pointForm.lon);
    const horizon = Number(pointForm.horizon_hours);
    const step = Number(pointForm.step_seconds);

    // Валидация
    const coordError = validateCoordinates(lat, lon);
    if (coordError) {
      setLocalError(coordError);
      return;
    }

    if (isNaN(horizon) || horizon <= 0 || horizon > 72) {
      setLocalError('Горизонт должен быть от 1 до 72 часов');
      return;
    }

    if (isNaN(step) || step < 30 || step > 3600) {
      setLocalError('Шаг должен быть от 30 до 3600 секунд');
      return;
    }

    onRunPointAnalysis({
      lat,
      lon,
      from_time: currentTime.toISOString(),
      horizon_hours: horizon,
      step_seconds: step,
      filters: activeFilters,
    });
  };

  const submitRegionAnalysis = () => {
    setLocalError('');

    const minLat = Number(regionForm.min_lat);
    const maxLat = Number(regionForm.max_lat);
    const minLon = Number(regionForm.min_lon);
    const maxLon = Number(regionForm.max_lon);
    const horizon = Number(regionForm.horizon_hours);
    const step = Number(regionForm.step_seconds);

    const regionError = validateRegion(minLat, maxLat, minLon, maxLon);
    if (regionError) {
      setLocalError(regionError);
      return;
    }

    if (isNaN(horizon) || horizon <= 0 || horizon > 72) {
      setLocalError('Горизонт должен быть от 1 до 72 часов');
      return;
    }

    if (isNaN(step) || step < 30 || step > 3600) {
      setLocalError('Шаг должен быть от 30 до 3600 секунд');
      return;
    }

    onRunRegionAnalysis({
      region: {
        type: 'bbox',
        min_lat: minLat,
        min_lon: minLon,
        max_lat: maxLat,
        max_lon: maxLon,
      },
      from_time: currentTime.toISOString(),
      horizon_hours: horizon,
      step_seconds: step,
      filters: activeFilters,
    });
  };

  const submitCompareGroups = () => {
    setLocalError('');

    if (!groupA.name && !groupB.name) {
      setLocalError('Укажите названия групп');
      return;
    }

    onRunCompareGroups({
      groups: [
        { name: groupA.name || 'Группа A', filters: buildFilters(groupA) },
        { name: groupB.name || 'Группа B', filters: buildFilters(groupB) },
      ],
    });
  };

  return (
    <div className="analysis-panel" style={{ marginTop: '16px' }}>
      <div className="analysis-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
        <button onClick={() => { setActiveTab('point'); setLocalError(''); }} className={`tab-btn ${activeTab === 'point' ? 'active' : ''}`}>📍 По точке</button>
        <button onClick={() => { setActiveTab('region'); setLocalError(''); }} className={`tab-btn ${activeTab === 'region' ? 'active' : ''}`}>🌍 По региону</button>
        <button onClick={() => { setActiveTab('compare'); setLocalError(''); }} className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`}>⚖️ Сравнение</button>
      </div>

      {/* Ошибки */}
      {(error || localError) && (
        <div style={{ color: '#ffaa66', fontSize: '0.8rem', marginBottom: '12px', padding: '8px', background: 'rgba(255,170,102,0.1)', borderRadius: '8px' }}>
          {error || localError}
        </div>
      )}

      {/* Анализ по точке */}
      {activeTab === 'point' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#aaa' }}>Широта (-90..90)</label>
              <input type="number" step="any" value={pointForm.lat} onChange={(e) => setPointForm({ ...pointForm, lat: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#aaa' }}>Долгота (-180..180)</label>
              <input type="number" step="any" value={pointForm.lon} onChange={(e) => setPointForm({ ...pointForm, lon: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#aaa' }}>Горизонт (1-72 ч)</label>
              <input type="number" value={pointForm.horizon_hours} onChange={(e) => setPointForm({ ...pointForm, horizon_hours: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#aaa' }}>Шаг (30-3600 сек)</label>
              <input type="number" value={pointForm.step_seconds} onChange={(e) => setPointForm({ ...pointForm, step_seconds: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} />
            </div>
          </div>
          <button onClick={submitPointAnalysis} style={{ width: '100%', padding: '8px', background: '#61dafb', border: 'none', borderRadius: '8px', color: '#1a1a2e', fontWeight: 'bold', cursor: 'pointer' }} disabled={loading}>
            {loading ? 'Анализ...' : 'Запустить анализ'}
          </button>
          {results.point && !loading && (
            <div style={{ marginTop: '12px', maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ fontSize: '0.7rem', color: '#61dafb', marginBottom: '8px' }}>Найдено: {results.point.matches?.length || 0}</div>
              {results.point.matches?.slice(0, 5).map((item, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px', marginBottom: '6px', fontSize: '0.7rem' }}>
                  <strong>{item.satellite?.name}</strong>
                  <div>🕐 {item.next_pass?.enter_time ? formatTimestamp(item.next_pass.enter_time) : '—'}</div>
                  <div>📏 {item.next_pass?.min_distance_km ? Math.round(item.next_pass.min_distance_km) : '—'} км</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Анализ по региону */}
      {activeTab === 'region' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div><label style={{ fontSize: '0.7rem', color: '#aaa' }}>Широта (-90..90)</label><input type="number" step="any" value={regionForm.min_lat} onChange={(e) => setRegionForm({ ...regionForm, min_lat: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} /></div>
            <div><label style={{ fontSize: '0.7rem', color: '#aaa' }}>Широта (-90..90)</label><input type="number" step="any" value={regionForm.max_lat} onChange={(e) => setRegionForm({ ...regionForm, max_lat: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} /></div>
            <div><label style={{ fontSize: '0.7rem', color: '#aaa' }}>Долгота (-180..180)</label><input type="number" step="any" value={regionForm.min_lon} onChange={(e) => setRegionForm({ ...regionForm, min_lon: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} /></div>
            <div><label style={{ fontSize: '0.7rem', color: '#aaa' }}>Долгота (-180..180)</label><input type="number" step="any" value={regionForm.max_lon} onChange={(e) => setRegionForm({ ...regionForm, max_lon: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }} /></div>
          </div>
          <button onClick={submitRegionAnalysis} style={{ width: '100%', padding: '8px', background: '#61dafb', border: 'none', borderRadius: '8px', color: '#1a1a2e', fontWeight: 'bold', cursor: 'pointer' }} disabled={loading}>
            {loading ? 'Анализ...' : 'Запустить анализ региона'}
          </button>
          {results.region && !loading && (
            <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px' }}>
              <div style={{ fontSize: '0.8rem' }}>Найдено спутников: <strong>{results.region.matches?.length || 0}</strong></div>
            </div>
          )}
        </div>
      )}

      {/* Сравнение группировок */}
      {activeTab === 'compare' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem' }}>Группа A</h4>
              <input type="text" placeholder="Название" value={groupA.name} onChange={(e) => setGroupA({ ...groupA, name: e.target.value })} style={{ width: '100%', padding: '4px', marginBottom: '6px', fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px' }} />
              <select value={groupA.country} onChange={(e) => setGroupA({ ...groupA, country: e.target.value })} style={{ width: '100%', padding: '4px', marginBottom: '4px', fontSize: '0.7rem' }}>
                <option value="">Страна</option>
                {(filterOptions.countries || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={groupA.orbit_type} onChange={(e) => setGroupA({ ...groupA, orbit_type: e.target.value })} style={{ width: '100%', padding: '4px', fontSize: '0.7rem' }}>
                <option value="">Тип орбиты</option>
                {(filterOptions.orbit_types || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem' }}>Группа B</h4>
              <input type="text" placeholder="Название" value={groupB.name} onChange={(e) => setGroupB({ ...groupB, name: e.target.value })} style={{ width: '100%', padding: '4px', marginBottom: '6px', fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px' }} />
              <select value={groupB.country} onChange={(e) => setGroupB({ ...groupB, country: e.target.value })} style={{ width: '100%', padding: '4px', marginBottom: '4px', fontSize: '0.7rem' }}>
                <option value="">Страна</option>
                {(filterOptions.countries || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={groupB.orbit_type} onChange={(e) => setGroupB({ ...groupB, orbit_type: e.target.value })} style={{ width: '100%', padding: '4px', fontSize: '0.7rem' }}>
                <option value="">Тип орбиты</option>
                {(filterOptions.orbit_types || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <button onClick={submitCompareGroups} style={{ width: '100%', padding: '8px', background: '#61dafb', border: 'none', borderRadius: '8px', color: '#1a1a2e', fontWeight: 'bold', cursor: 'pointer' }} disabled={loading}>
            {loading ? 'Сравнение...' : 'Сравнить группировки'}
          </button>
          {results.compare && !loading && (
            <div style={{ marginTop: '12px' }}>
              {results.compare.groups?.map((group, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                  <strong>{group.name}</strong>
                  <div>📊 {group.count} спутников</div>
                  <div>📏 Высота: {Math.round(group.avg_altitude_km)} км</div>
                  <div>⏱️ Период: {Math.round(group.avg_period_minutes)} мин</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}