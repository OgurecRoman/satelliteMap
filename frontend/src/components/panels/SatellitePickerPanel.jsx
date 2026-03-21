import React, { useMemo, useState } from 'react';

const MAX_VISIBLE_RESULTS = 150;

export default function SatellitePickerPanel({ satellites, selectedSatelliteId, onSelectSatellite }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source = [...satellites].sort((left, right) =>
      (left.satellite_name || '').localeCompare((right.satellite_name || ''), 'ru')
    );

    if (!normalizedQuery) return source.slice(0, MAX_VISIBLE_RESULTS);

    const exactMatches = source.filter((item) => {
      const name = String(item.satellite_name || '').trim().toLowerCase();
      const norad = String(item.satellite_id || '').trim().toLowerCase();
      return name === normalizedQuery || norad === normalizedQuery;
    });
    if (exactMatches.length) return exactMatches.slice(0, MAX_VISIBLE_RESULTS);

    return source
      .filter((item) => {
        const label = `${item.satellite_name} ${item.satellite_id}`.toLowerCase();
        return label.includes(normalizedQuery);
      })
      .slice(0, MAX_VISIBLE_RESULTS);
  }, [query, satellites]);

  return (
    <section className="panel-section">
      <div className="section-header">
        <h3>Выбор спутника</h3>
        <span className="status-pill">{satellites.length} в 3D</span>
      </div>

      <label className="field-label" htmlFor="satellite-picker-search">Поиск по имени или NORAD ID</label>
      <input
        id="satellite-picker-search"
        type="text"
        placeholder="Например: ISS или 25544"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="picker-results">
        {filtered.length ? (
          filtered.map((satellite) => (
            <button
              key={satellite.satellite_id}
              type="button"
              className={satellite.satellite_id === selectedSatelliteId ? 'picker-item picker-item-active' : 'picker-item'}
              onClick={() => onSelectSatellite(satellite.satellite_id)}
            >
              <strong>{satellite.satellite_name}</strong>
              <span>NORAD {satellite.satellite_id}</span>
            </button>
          ))
        ) : (
          <p className="muted-text">По вашему запросу спутники не найдены.</p>
        )}
      </div>

      <div className="button-row">
        <button type="button" className="secondary-button full-width" onClick={() => onSelectSatellite(null)}>
          Сбросить выбор
        </button>
      </div>

      <p className="muted-text">
        На панели показаны первые {MAX_VISIBLE_RESULTS} результатов. Для больших наборов спутников используйте поиск или клик по точке на 3D-глобусе.
      </p>
    </section>
  );
}
