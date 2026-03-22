import React, { useEffect, useState } from 'react';
import { formatCoordinate } from '../../utils/coordinates';
import { formatTimestamp } from '../../utils/time';

const DEFAULT_REGION = { min_lat: 50, min_lon: 30, max_lat: 60, max_lon: 40 };
const DEFAULT_GROUP_A = { name: 'Группа A', country: '', operator: '', orbit_type: '', purpose: '' };
const DEFAULT_GROUP_B = { name: 'Группа B', country: '', operator: '', orbit_type: '', purpose: '' };
const MAX_GROUP_NAME_LENGTH = 32;
const MAX_ANALYSIS_HORIZON_HOURS = 168;
const MIN_ANALYSIS_STEP_SECONDS = 10;
const MAX_ANALYSIS_STEP_SECONDS = 3600;

export default function AnalysisPanel({
  currentTime,
  selectedPoint,
  selectedSatelliteId,
  activeFilters,
  onRunPointAnalysis,
  onRunRegionAnalysis,
  onRunCompareGroups,
  onCreateSubscription,
  subscriptions,
  filterOptions,
  results,
  loading,
  error,
}) {
  const [pointForm, setPointForm] = useState({ lat: 55.75, lon: 37.62, horizon_hours: 6, step_seconds: 600 });
  const [regionForm, setRegionForm] = useState({ ...DEFAULT_REGION, horizon_hours: 6, step_seconds: 900 });
  const [groupA, setGroupA] = useState(DEFAULT_GROUP_A);
  const [groupB, setGroupB] = useState(DEFAULT_GROUP_B);
  const [subscriptionForm, setSubscriptionForm] = useState({
    name: 'Оповещение о пролёте',
    target_type: 'point',
    contact_email: '',
    note: '',
    horizon_hours: 6,
    step_seconds: 600,
  });
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (selectedPoint) {
      setPointForm((prev) => ({
        ...prev,
        lat: Number(selectedPoint.lat.toFixed(4)),
        lon: Number(selectedPoint.lon.toFixed(4)),
      }));
    }
  }, [selectedPoint]);

  const pointValues = { lat: pointForm.lat, lon: pointForm.lon };
  const visibleError = localError || error;

  const buildFilters = (group) => Object.fromEntries(
    Object.entries({
      country: group.country,
      operator: group.operator,
      orbit_type: group.orbit_type,
      purpose: group.purpose,
    }).filter(([, value]) => value)
  );

  const validatePointForm = () => {
    const lat = Number(pointValues.lat);
    const lon = Number(pointValues.lon);
    const horizonHours = Number(pointForm.horizon_hours);
    const stepSeconds = Number(pointForm.step_seconds);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return 'Широта должна быть в диапазоне от -90 до 90.';
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      return 'Долгота должна быть в диапазоне от -180 до 180.';
    }
    if (!Number.isInteger(horizonHours) || horizonHours < 1 || horizonHours > MAX_ANALYSIS_HORIZON_HOURS) {
      return `Горизонт анализа должен быть от 1 до ${MAX_ANALYSIS_HORIZON_HOURS} часов.`;
    }
    if (!Number.isInteger(stepSeconds) || stepSeconds < MIN_ANALYSIS_STEP_SECONDS || stepSeconds > MAX_ANALYSIS_STEP_SECONDS) {
      return `Шаг анализа должен быть от ${MIN_ANALYSIS_STEP_SECONDS} до ${MAX_ANALYSIS_STEP_SECONDS} секунд.`;
    }
    return '';
  };

  const validateRegionForm = () => {
    const minLat = Number(regionForm.min_lat);
    const minLon = Number(regionForm.min_lon);
    const maxLat = Number(regionForm.max_lat);
    const maxLon = Number(regionForm.max_lon);
    const horizonHours = Number(regionForm.horizon_hours);
    const stepSeconds = Number(regionForm.step_seconds);

    if (!Number.isFinite(minLat) || minLat < -90 || minLat > 90 || !Number.isFinite(maxLat) || maxLat < -90 || maxLat > 90) {
      return 'Широта региона должна быть в диапазоне от -90 до 90.';
    }
    if (!Number.isFinite(minLon) || minLon < -180 || minLon > 180 || !Number.isFinite(maxLon) || maxLon < -180 || maxLon > 180) {
      return 'Долгота региона должна быть в диапазоне от -180 до 180.';
    }
    if (maxLat <= minLat || maxLon <= minLon) {
      return 'Максимальные координаты региона должны быть больше минимальных.';
    }
    if (!Number.isInteger(horizonHours) || horizonHours < 1 || horizonHours > MAX_ANALYSIS_HORIZON_HOURS) {
      return `Горизонт анализа должен быть от 1 до ${MAX_ANALYSIS_HORIZON_HOURS} часов.`;
    }
    if (!Number.isInteger(stepSeconds) || stepSeconds < MIN_ANALYSIS_STEP_SECONDS || stepSeconds > MAX_ANALYSIS_STEP_SECONDS) {
      return `Шаг анализа должен быть от ${MIN_ANALYSIS_STEP_SECONDS} до ${MAX_ANALYSIS_STEP_SECONDS} секунд.`;
    }
    return '';
  };

  const submitPointAnalysis = () => {
    const validationError = validatePointForm();
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError('');
    onRunPointAnalysis({
      lat: Number(pointValues.lat),
      lon: Number(pointValues.lon),
      from_time: currentTime.toISOString(),
      horizon_hours: Number(pointForm.horizon_hours),
      step_seconds: Number(pointForm.step_seconds),
      filters: activeFilters,
    });
  };

  const submitRegionAnalysis = () => {
    const validationError = validateRegionForm();
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError('');
    onRunRegionAnalysis({
      region: {
        type: 'bbox',
        min_lat: Number(regionForm.min_lat),
        min_lon: Number(regionForm.min_lon),
        max_lat: Number(regionForm.max_lat),
        max_lon: Number(regionForm.max_lon),
      },
      from_time: currentTime.toISOString(),
      horizon_hours: Number(regionForm.horizon_hours),
      step_seconds: Number(regionForm.step_seconds),
      filters: activeFilters,
    });
  };

  const submitCompareGroups = () => {
    setLocalError('');
    onRunCompareGroups({
      groups: [
        { name: normalizeGroupName(groupA.name, 'Группа A'), filters: buildFilters(groupA) },
        { name: normalizeGroupName(groupB.name, 'Группа B'), filters: buildFilters(groupB) },
      ],
    });
  };

  const submitSubscription = () => {
    const validationError = subscriptionForm.target_type === 'point' ? validatePointForm() : validateRegionForm();
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError('');

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

    if (subscriptionForm.target_type === 'point') {
      payload.point_lat = Number(pointValues.lat);
      payload.point_lon = Number(pointValues.lon);
    } else {
      payload.region = {
        type: 'bbox',
        min_lat: Number(regionForm.min_lat),
        min_lon: Number(regionForm.min_lon),
        max_lat: Number(regionForm.max_lat),
        max_lon: Number(regionForm.max_lon),
      };
    }

    onCreateSubscription(payload);
  };

  return (
    <section className="panel-section">
      <div className="section-header">
        <h3>Аналитика и оповещения</h3>
        {loading ? <span className="status-pill">Выполняется…</span> : null}
      </div>
      {visibleError ? <div className="error-banner">{visibleError}</div> : null}

      <div className="stack-card">
        <h4>Анализ пролётов над точкой</h4>
        <p className="muted-text">Используйте точку, выбранную на глобусе, или вручную задайте координаты ниже. Для больших наборов спутников по умолчанию используется более щадящий горизонт расчёта.</p>
        <div className="field-grid two-columns">
          <div>
            <label className="field-label">Широта</label>
            <input type="number" min="-90" max="90" step="0.0001" value={pointValues.lat} onChange={(event) => setPointForm((prev) => ({ ...prev, lat: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Долгота</label>
            <input type="number" min="-180" max="180" step="0.0001" value={pointValues.lon} onChange={(event) => setPointForm((prev) => ({ ...prev, lon: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Горизонт, часов</label>
            <input type="number" min="1" max={MAX_ANALYSIS_HORIZON_HOURS} step="1" value={pointForm.horizon_hours} onChange={(event) => setPointForm((prev) => ({ ...prev, horizon_hours: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Шаг, сек</label>
            <input type="number" min={MIN_ANALYSIS_STEP_SECONDS} max={MAX_ANALYSIS_STEP_SECONDS} step="1" value={pointForm.step_seconds} onChange={(event) => setPointForm((prev) => ({ ...prev, step_seconds: event.target.value }))} />
          </div>
        </div>
        <button type="button" className="primary-button full-width" onClick={submitPointAnalysis}>Запустить анализ точки</button>
        {results.point ? (
          <div className="result-box">
            <strong>{results.point.matches.length}</strong> совпадений найдено
            <div className="result-list">
              {results.point.matches.slice(0, 5).map((item) => (
                <div key={`${item.satellite.id}-${item.next_pass.enter_time}`} className="result-item">
                  <div>
                    <strong>{item.satellite.name}</strong>
                    <p>{item.satellite.operator}</p>
                  </div>
                  <div>
                    <p>{formatTimestamp(item.next_pass.enter_time)}</p>
                    <p className="muted-text">Мин. дистанция {formatCoordinate(item.next_pass.min_distance_km)} км</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="stack-card">
        <h4>Анализ пролётов над регионом</h4>
        <div className="field-grid two-columns">
          {Object.keys(DEFAULT_REGION).map((key) => (
            <div key={key}>
              <label className="field-label">{translateRegionField(key)}</label>
              <input type="number" min={key.includes('lat') ? '-90' : '-180'} max={key.includes('lat') ? '90' : '180'} step="0.0001" value={regionForm[key]} onChange={(event) => setRegionForm((prev) => ({ ...prev, [key]: event.target.value }))} />
            </div>
          ))}
          <div>
            <label className="field-label">Горизонт, часов</label>
            <input type="number" min="1" max={MAX_ANALYSIS_HORIZON_HOURS} step="1" value={regionForm.horizon_hours} onChange={(event) => setRegionForm((prev) => ({ ...prev, horizon_hours: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Шаг, сек</label>
            <input type="number" min={MIN_ANALYSIS_STEP_SECONDS} max={MAX_ANALYSIS_STEP_SECONDS} step="1" value={regionForm.step_seconds} onChange={(event) => setRegionForm((prev) => ({ ...prev, step_seconds: event.target.value }))} />
          </div>
        </div>
        <button type="button" className="secondary-button full-width" onClick={submitRegionAnalysis}>Запустить анализ региона</button>
        {results.region ? <div className="result-box"><strong>{results.region.matches.length}</strong> спутников пересекают выбранный регион</div> : null}
      </div>

      <div className="stack-card">
        <h4>Сравнение группировок</h4>
        <div className="field-grid two-columns">
          <GroupEditor title="Группа A" value={groupA} onChange={setGroupA} filterOptions={filterOptions} />
          <GroupEditor title="Группа B" value={groupB} onChange={setGroupB} filterOptions={filterOptions} />
        </div>
        <button type="button" className="secondary-button full-width" onClick={submitCompareGroups}>Сравнить группировки</button>
        {results.compare ? (
          <div className="result-list">
            {results.compare.groups.map((group) => (
              <div key={group.name} className="result-item compact">
                <div className="truncate-container">
                  <strong className="truncate-text" title={group.name}>{truncateText(group.name)}</strong>
                  <p>{group.count} спутников</p>
                </div>
                <div>
                  <p>Средняя высота {formatCoordinate(group.avg_altitude_km)} км</p>
                  <p className="muted-text">Средний период {formatCoordinate(group.avg_period_minutes)} мин</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="stack-card">
        <h4>Подписки</h4>
        <div className="field-grid two-columns">
          <div>
            <label className="field-label">Название</label>
            <input type="text" value={subscriptionForm.name} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Тип цели</label>
            <select value={subscriptionForm.target_type} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, target_type: event.target.value }))}>
              <option value="point">Точка</option>
              <option value="region">Регион</option>
            </select>
          </div>
          <div>
            <label className="field-label">E-mail для уведомления</label>
            <input type="email" value={subscriptionForm.contact_email} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, contact_email: event.target.value }))} />
          </div>
          <div>
            <label className="field-label">Выбранный спутник</label>
            <input type="text" value={selectedSatelliteId || 'Любой'} readOnly />
          </div>
        </div>
        <label className="field-label">Заметка</label>
        <textarea value={subscriptionForm.note} rows={2} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, note: event.target.value }))} />
        <button type="button" className="primary-button full-width" onClick={submitSubscription}>Создать подписку</button>
        <div className="result-box">
          <strong>{subscriptions.length}</strong> сохранённых подписок
          <div className="result-list">
            {subscriptions.slice(0, 5).map((item) => (
              <div key={item.id} className="result-item compact">
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.target_type === 'point' ? 'Точка' : 'Регион'}</p>
                </div>
                <div>
                  <p>{item.is_active ? 'Активна' : 'Неактивна'}</p>
                  <p className="muted-text">{item.contact_email || 'Без e-mail'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GroupEditor({ title, value, onChange, filterOptions }) {
  const update = (key, nextValue) => onChange((prev) => ({ ...prev, [key]: nextValue }));

  return (
    <div className="info-card compact-card">
      <h5>{title}</h5>
      <label className="field-label">Название</label>
      <input type="text" maxLength={MAX_GROUP_NAME_LENGTH} value={value.name} onChange={(event) => update('name', event.target.value)} />
      <label className="field-label">Страна</label>
      <select value={value.country} onChange={(event) => update('country', event.target.value)}>
        <option value="">Любая</option>
        {(filterOptions.countries || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <label className="field-label">Оператор</label>
      <select value={value.operator} onChange={(event) => update('operator', event.target.value)}>
        <option value="">Любой</option>
        {(filterOptions.operators || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <label className="field-label">Тип орбиты</label>
      <select value={value.orbit_type} onChange={(event) => update('orbit_type', event.target.value)}>
        <option value="">Любой</option>
        {(filterOptions.orbit_types || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <label className="field-label">Назначение</label>
      <select value={value.purpose} onChange={(event) => update('purpose', event.target.value)}>
        <option value="">Любое</option>
        {(filterOptions.purposes || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <p className="muted-text">До {MAX_GROUP_NAME_LENGTH} символов.</p>
    </div>
  );
}

function normalizeGroupName(value, fallback) {
  const normalized = (value || '').trim();
  return normalized || fallback;
}

function truncateText(value, maxLength = 32) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function translateRegionField(field) {
  const labels = {
    min_lat: 'Мин. широта',
    min_lon: 'Мин. долгота',
    max_lat: 'Макс. широта',
    max_lon: 'Макс. долгота',
  };
  return labels[field] || field;
}
