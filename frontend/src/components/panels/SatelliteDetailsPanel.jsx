import React from 'react';
import { formatCompactNumber, formatCoordinate } from '../../utils/coordinates';
import { formatTimestamp } from '../../utils/time';

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export default function SatelliteDetailsPanel({
  satelliteCard,
  selectedPoint,
  selectedSatellitePreview,
  track,
  visibilityFootprint,
  elevationFootprint,
  minElevationDeg,
  loading,
  error,
}) {
  if (!selectedSatellitePreview && !satelliteCard && !loading && !error) {
    return (
      <section className="panel-section">
        <div className="section-header">
          <h3>Карточка спутника</h3>
        </div>
        <p className="muted-text">Выберите спутник в 3D, чтобы загрузить карточку, трек, геометрическую зону видимости, рабочую зону по углу места и данные о следующем пролёте.</p>
      </section>
    );
  }

  const title = satelliteCard?.name || selectedSatellitePreview?.satellite_name || 'Загрузка данных спутника';
  const noradId = satelliteCard?.norad_id || selectedSatellitePreview?.satellite_id;
  const position = satelliteCard?.current_position || selectedSatellitePreview || null;
  const nextPass = satelliteCard?.next_pass_over_point || null;
  const trackPointsCount = track?.points?.length || 0;

  return (
    <section className="panel-section">
      <div className="section-header">
        <h3>Карточка спутника</h3>
        {loading ? <span className="status-pill">Загрузка…</span> : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="satellite-title-block">
        <h2>{title}</h2>
        <p>NORAD {noradId || '—'}</p>
      </div>

      {satelliteCard ? (
        <>
          <div className="detail-grid">
            <DetailRow label="Страна" value={satelliteCard.country} />
            <DetailRow label="Оператор" value={satelliteCard.operator} />
            <DetailRow label="Орбита" value={satelliteCard.orbit_type} />
            <DetailRow label="Назначение" value={satelliteCard.purpose} />
            <DetailRow label="Высота" value={Number.isFinite(satelliteCard.approx_altitude_km) ? `${formatCompactNumber(satelliteCard.approx_altitude_km, 1)} км` : '—'} />
            <DetailRow label="Период" value={Number.isFinite(satelliteCard.period_minutes) ? `${formatCompactNumber(satelliteCard.period_minutes, 1)} мин` : '—'} />
            <DetailRow label="Скорость" value={`${formatCoordinate(position?.velocity?.speed_km_s)} км/с`} />
            <DetailRow label="Эпоха TLE" value={satelliteCard.latest_tle_epoch ? formatTimestamp(satelliteCard.latest_tle_epoch) : '—'} />
          </div>
        </>
      ) : null}

      {position?.geodetic ? (
        <div className="info-card compact-card">
          <h4>Текущие координаты</h4>
          <p>
            Широта {formatCoordinate(position.geodetic.lat)}°, долгота {formatCoordinate(position.geodetic.lon)}°, высота {formatCoordinate(position.geodetic.alt_km)} км
          </p>
          <p>Скорость: {formatCoordinate(position?.velocity?.speed_km_s)} км/с</p>
          <p className="muted-text">Время: {formatTimestamp(position.timestamp)}</p>
        </div>
      ) : null}

      <div className="info-card compact-card">
        <h4>Отображение выбранного спутника</h4>
        <div className="result-list">
          <div className="result-item compact">
            <p>Траектория</p>
            <strong>{trackPointsCount ? `${trackPointsCount} точек` : 'нет данных'}</strong>
          </div>
          <div className="result-item compact result-item-wide">
            <div>
              <p>Зелёная зона: геометрическая видимость (0°)</p>
              <p className="muted-text">Спутник выше горизонта для наблюдателя в этой области.</p>
            </div>
            <div className="footprint-stats">
              <strong>{visibilityFootprint?.polygon?.coordinates?.[0]?.length ? 'построена' : 'нет данных'}</strong>
              <span>Угол: {formatCompactNumber(visibilityFootprint?.angular_radius_deg, 1)}°</span>
              <span>Радиус: {formatCompactNumber(visibilityFootprint?.radius_km, 0)} км</span>
            </div>
          </div>
          <div className="result-item compact result-item-wide">
            <div>
              <p>Фиолетовая зона: видимость при угле места ≥ {formatCompactNumber(minElevationDeg, 0)}°</p>
              <p className="muted-text">Это рабочая зона, где спутник уже поднялся выше заданного угла места.</p>
            </div>
            <div className="footprint-stats">
              <strong>{Number.isFinite(elevationFootprint?.angular_radius_deg) ? 'построена' : 'нет данных'}</strong>
              <span>Угол: {formatCompactNumber(elevationFootprint?.angular_radius_deg, 1)}°</span>
              <span>Радиус: {formatCompactNumber(elevationFootprint?.surface_radius_km, 0)} км</span>
            </div>
          </div>
        </div>
      </div>

      <div className="info-card compact-card">
        <h4>Следующий пролёт выбранного спутника над точкой</h4>
        {selectedPoint && nextPass ? (
          <>
            <p>Точка: {formatCoordinate(selectedPoint.lat)}°, {formatCoordinate(selectedPoint.lon)}°</p>
            <p>Вход в зону видимости: {formatTimestamp(nextPass.enter_time)}</p>
            <p>Максимальное сближение: {formatTimestamp(nextPass.peak_time)}</p>
            <p>Выход из зоны видимости: {formatTimestamp(nextPass.exit_time)}</p>
            <p>Минимальная дистанция до точки: {formatCoordinate(nextPass.min_distance_km)} км</p>
          </>
        ) : (
          <p className="muted-text">Выберите спутник и точку на глобусе, чтобы посчитать его следующий пролёт.</p>
        )}
      </div>
    </section>
  );
}
