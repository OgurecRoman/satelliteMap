import React, { useEffect, useState } from 'react';
import './Sidebar.css';
import SubscriptionsPanel2D from './SubscriptionsPanel2D';
import AnalysisPanel2D from './AnalysisPanel2D';

const Sidebar = ({
    satellites,
    satellitesPosition,
    onFilterChange,
    onCountrySelect,
    onPointSelect,
    flyovers,
    loadingFlyovers,
    selectedPoint,
    selectedCountry,
    flyoverMode,
    onSpeedChange,
    currentSpeed,
    analysisResults,
    onRunPointAnalysis,
    onRunRegionAnalysis,
    onRunCompareGroups,
    loadingAnalysis,
    analysisError,
    subscriptions,
    onCreateSubscription,
    selectedSatelliteId,
    selectedSatelliteName,
    minElevationDeg,
    onMinElevationChange,
    fancyMode,
    onFancyModeChange,
}) => {
    const [filters, setFilters] = useState({
        country: '',
        orbitType: '',
        purpose: '',
    });

    const [availableCountries, setAvailableCountries] = useState([]);
    const [availableOrbitTypes, setAvailableOrbitTypes] = useState([]);
    const [availablePurposes, setAvailablePurposes] = useState([]);
    const [activeLeftTab, setActiveLeftTab] = useState('filters');

    useEffect(() => {
        if (satellites && satellites.length > 0) {
            const countries = [...new Set(satellites.map((sat) => sat.country).filter((c) => c && c !== 'Unknown'))];
            const orbitTypes = [...new Set(satellites.map((sat) => sat.orbit_type).filter(Boolean))];
            const purposes = [...new Set(satellites.map((sat) => sat.purpose).filter(Boolean))];

            setAvailableCountries(countries.sort());
            setAvailableOrbitTypes(orbitTypes.sort());
            setAvailablePurposes(purposes.sort());
        }
    }, [satellites]);

    const handleFilterChange = (filterName, value) => {
        const newFilters = { ...filters, [filterName]: value };
        setFilters(newFilters);
        onFilterChange(newFilters);
    };

    const clearFilters = () => {
        const emptyFilters = { country: '', orbitType: '', purpose: '' };
        setFilters(emptyFilters);
        onFilterChange(emptyFilters);
    };

    const normalizedPoint = selectedPoint
        ? {
              lat: selectedPoint.lat,
              lon: typeof selectedPoint.lon === 'number' ? selectedPoint.lon : selectedPoint.lng,
              lng: typeof selectedPoint.lng === 'number' ? selectedPoint.lng : selectedPoint.lon,
          }
        : null;

    return (
        <>
            <div className="sidebar-left">
                <div
                    className="sidebar-tabs"
                    style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}
                >
                    <button
                        onClick={() => setActiveLeftTab('filters')}
                        className={`tab-btn ${activeLeftTab === 'filters' ? 'active' : ''}`}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: activeLeftTab === 'filters' ? 'rgba(97, 218, 251, 0.2)' : 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            color: activeLeftTab === 'filters' ? '#61dafb' : 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                        }}
                    >
                        🎛️ Фильтры
                    </button>
                    <button
                        onClick={() => setActiveLeftTab('subscriptions')}
                        className={`tab-btn ${activeLeftTab === 'subscriptions' ? 'active' : ''}`}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: activeLeftTab === 'subscriptions' ? 'rgba(97, 218, 251, 0.2)' : 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            color: activeLeftTab === 'subscriptions' ? '#61dafb' : 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                        }}
                    >
                        🔔 Подписки
                    </button>
                </div>

                {activeLeftTab === 'filters' && (
                    <>
                        <div className="sidebar-header">
                            <h3>🛰️ Фильтры спутников</h3>
                            <button className="clear-btn" onClick={clearFilters}>
                                Сбросить
                            </button>
                        </div>

                        <div className="filter-section">
                            <label className="filter-label">Страна / Оператор</label>
                            <select value={filters.country} onChange={(e) => handleFilterChange('country', e.target.value)} className="filter-select">
                                <option value="">Все страны</option>
                                {availableCountries.map((country) => (
                                    <option key={country} value={country}>
                                        {country}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-section">
                            <label className="filter-label">Тип орбиты</label>
                            <select value={filters.orbitType} onChange={(e) => handleFilterChange('orbitType', e.target.value)} className="filter-select">
                                <option value="">Все типы</option>
                                {availableOrbitTypes.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-section">
                            <label className="filter-label">Назначение</label>
                            <select value={filters.purpose} onChange={(e) => handleFilterChange('purpose', e.target.value)} className="filter-select">
                                <option value="">Все назначения</option>
                                {availablePurposes.map((purpose) => (
                                    <option key={purpose} value={purpose}>
                                        {purpose}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="stats-section">
                            <h4>📊 Статистика</h4>
                            <div className="stat-item">
                                <span>Всего спутников:</span>
                                <strong>{satellites?.length || 0}</strong>
                            </div>
                            {filters.country && (
                                <div className="stat-item">
                                    <span>Фильтр:</span>
                                    <strong>{filters.country}</strong>
                                </div>
                            )}
                        </div>

                        <div className="speed-section">
                            <label className="filter-label">⚡ Скорость анимации</label>
                            <div className="speed-buttons">
                                <button className={`speed-btn ${currentSpeed === 1 ? 'active' : ''}`} onClick={() => onSpeedChange(1)}>1x</button>
                                <button className={`speed-btn ${currentSpeed === 5 ? 'active' : ''}`} onClick={() => onSpeedChange(5)}>5x</button>
                                <button className={`speed-btn ${currentSpeed === 10 ? 'active' : ''}`} onClick={() => onSpeedChange(10)}>10x</button>
                                <button className={`speed-btn ${currentSpeed === 100 ? 'active' : ''}`} onClick={() => onSpeedChange(100)}>100x</button>
                            </div>
                        </div>

                        <div className="speed-section elevation-section">
                            <label className="filter-label">📐 Рабочий угол места</label>
                            <div className="elevation-control-row">
                                <input
                                    type="number"
                                    min="0"
                                    max="45"
                                    step="1"
                                    value={minElevationDeg}
                                    onChange={(event) => onMinElevationChange(Number(event.target.value) || 0)}
                                    className="elevation-input"
                                />
                                <span className="elevation-unit">°</span>
                            </div>
                            <p className="elevation-hint">
                                {selectedSatelliteId
                                    ? `Фиолетовая зона строится для «${selectedSatelliteName}».`
                                    : 'Выберите спутник на карте, чтобы увидеть фиолетовую рабочую зону.'}
                            </p>
                        </div>

                        <div className="speed-section fancy-section">
                            <label className="filter-label">✨ Отрисовка спутников</label>
                            <label className="compact-fancy-toggle" htmlFor="fancy-mode-toggle-2d">
                                <input
                                    id="fancy-mode-toggle-2d"
                                    type="checkbox"
                                    checked={Boolean(fancyMode)}
                                    onChange={(event) => onFancyModeChange(event.target.checked)}
                                />
                                <span className="compact-fancy-toggle__slider" aria-hidden="true" />
                                <span className="compact-fancy-toggle__copy">
                                    <strong>Fancy режим</strong>
                                    <small>{fancyMode ? 'Маленькая иконка спутника' : 'Быстрые точки на canvas'}</small>
                                </span>
                            </label>
                        </div>
                    </>
                )}

                {activeLeftTab === 'subscriptions' && (
                    <div className="subscriptions-container" style={{ marginTop: '8px' }}>
                        <SubscriptionsPanel2D
                            subscriptions={subscriptions}
                            selectedPoint={normalizedPoint}
                            selectedSatelliteId={selectedSatelliteId}
                            activeFilters={filters}
                            onCreateSubscription={onCreateSubscription}
                            loading={loadingAnalysis}
                        />
                    </div>
                )}

                <div className="analytics-section" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#61dafb' }}>📊 Аналитика</h4>
                    <AnalysisPanel2D
                        currentTime={new Date()}
                        selectedPoint={normalizedPoint}
                        selectedSatelliteId={selectedSatelliteId}
                        activeFilters={filters}
                        onRunPointAnalysis={onRunPointAnalysis}
                        onRunRegionAnalysis={onRunRegionAnalysis}
                        onRunCompareGroups={onRunCompareGroups}
                        filterOptions={{
                            countries: [...new Set(satellites.map((s) => s.country).filter(Boolean))],
                            operators: [...new Set(satellites.map((s) => s.operator).filter(Boolean))],
                            orbit_types: [...new Set(satellites.map((s) => s.orbit_type).filter(Boolean))],
                            purposes: [...new Set(satellites.map((s) => s.purpose).filter(Boolean))],
                        }}
                        results={analysisResults}
                        loading={loadingAnalysis}
                        error={analysisError}
                    />
                </div>
            </div>

            <div className="sidebar-right">
                <div className="flyovers-header">
                    <h3>📡 Пролёты спутников</h3>
                    <div className="mode-switch">
                        <button
                            className={`mode-btn ${flyoverMode === 'point' ? 'active' : ''}`}
                            onClick={() => {
                                onPointSelect();
                            }}
                        >
                            🖱️ По точке
                        </button>
                        <button
                            className={`mode-btn ${flyoverMode === 'country' ? 'active' : ''}`}
                            onClick={() => {
                                onCountrySelect('');
                            }}
                        >
                            🌍 По странам
                        </button>
                    </div>
                </div>

                {flyoverMode === 'point' && (
                    <>
                        {!normalizedPoint && <p className="flyovers-hint">👆 Кликните на карту, чтобы выбрать точку</p>}
                        {normalizedPoint && (
                            <div className="selected-info">
                                📍 {normalizedPoint.lat.toFixed(2)}°, {normalizedPoint.lng.toFixed(2)}°
                            </div>
                        )}
                        <p className="sidebar-hotkey-hint">Пробел — снять выбранную точку</p>
                    </>
                )}

                {flyoverMode === 'country' && (
                    <>
                        {selectedCountry && <div className="selected-info">🌍 {selectedCountry}</div>}
                    </>
                )}

                {loadingFlyovers && <div className="loading">⏳ Расчёт пролётов...</div>}

                {!loadingFlyovers && flyovers.length > 0 && (
                    <div className="flyovers-list">
                        <div className="flyovers-label">Ближайшие пролёты (24 часа):</div>
                        {flyovers.map((flyover, idx) => (
                            <div key={idx} className="flyover-item">
                                <div className="flyover-name"><strong>{flyover.satellite_name}</strong></div>
                                <div className="flyover-time">🕐 {new Date(flyover.flyover_time).toLocaleString()}</div>
                                <div className="flyover-details">📊 {flyover.max_elevation}° | ⏱️ {flyover.duration_min} мин</div>
                                <div className="flyover-meta">{flyover.country} • {flyover.purpose}</div>
                            </div>
                        ))}
                    </div>
                )}

                {!loadingFlyovers && ((flyoverMode === 'point' && normalizedPoint) || (flyoverMode === 'country' && selectedCountry)) && flyovers.length === 0 && (
                    <p className="no-flyovers">⚠️ Нет пролётов в ближайшие 24 часа</p>
                )}

                {!loadingFlyovers && flyoverMode === 'country' && !selectedCountry && flyovers.length === 0 && (
                    <p className="flyovers-hint" style={{ textAlign: 'center', marginTop: 20 }}>
                        🌍 Выберите страну
                    </p>
                )}
            </div>
        </>
    );
};

export default Sidebar;
