import React, { useState, useEffect } from 'react';
import './Sidebar.css';
import SubscriptionsPanel2D from './SubscriptionsPanel2D';
import AnalysisPanel2D from './AnalysisPanel2D';

const Sidebar = ({
    satellites,           // все спутники с метаданными
    satellitesPosition,   // позиции спутников
    onFilterChange,       // callback для фильтров
    onCountrySelect,      // callback для выбора страны
    onPointSelect,        // callback для выбора точки
    flyovers,             // список пролётов
    loadingFlyovers,      // статус загрузки
    selectedPoint,        // выбранная точка
    selectedCountry,       // выбранная страна
    flyoverMode,
    onSpeedChange,
    currentSpeed,
    analysisResults,
    onRunPointAnalysis,
    onRunRegionAnalysis,
    onRunCompareGroups,
    loadingAnalysis,
    analysisError,
    subscriptions,           // ← только один раз
    onCreateSubscription,    // ← только один раз
}) => {
    const [filters, setFilters] = useState({
        country: '',
        orbitType: '',
        purpose: ''
    });

    // Уникальные значения для фильтров
    const [availableCountries, setAvailableCountries] = useState([]);
    const [availableOrbitTypes, setAvailableOrbitTypes] = useState([]);
    const [availablePurposes, setAvailablePurposes] = useState([]);

    // Страны для режима "По странам"
    const [countriesForSelect, setCountriesForSelect] = useState([]);
    const [activeLeftTab, setActiveLeftTab] = useState('filters'); //

    // Извлекаем уникальные значения из данных
    useEffect(() => {
        if (satellites && satellites.length > 0) {
            const countries = [...new Set(satellites.map(sat => sat.country).filter(c => c && c !== 'Unknown'))];
            const orbitTypes = [...new Set(satellites.map(sat => sat.orbit_type).filter(o => o))];
            const purposes = [...new Set(satellites.map(sat => sat.purpose).filter(p => p))];

            setAvailableCountries(countries.sort());
            setAvailableOrbitTypes(orbitTypes.sort());
            setAvailablePurposes(purposes.sort());
            setCountriesForSelect(countries.sort());
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

    const handleCountryModeSelect = (country) => {
        onCountrySelect(country);  // просто передаём страну, режим переключается в родителе
    };

    const handlePointModeSelect = () => {
        onPointSelect();  // вызываем функцию из пропсов
        onCountrySelect('');  // очищаем выбранную страну
    };

    return (
        <>
            {/* ЛЕВАЯ ПАНЕЛЬ - Фильтры */}
            <div className="sidebar-left">
            {/* Вкладки */}
            <div className="sidebar-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
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
                        fontSize: '0.85rem'
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
                        fontSize: '0.85rem'
                    }}
                >
                    🔔 Подписки
                </button>
            </div>

            {/* Контент фильтров */}
            {activeLeftTab === 'filters' && (
                <>
                    <div className="sidebar-header">
                        <h3>🛰️ Фильтры спутников</h3>
                        <button className="clear-btn" onClick={clearFilters}>
                            Сбросить
                        </button>
                    </div>

                    {/* Фильтры */}
                    <div className="filter-section">
                        <label className="filter-label">Страна / Оператор</label>
                        <select
                            value={filters.country}
                            onChange={(e) => handleFilterChange('country', e.target.value)}
                            className="filter-select"
                        >
                            <option value="">Все страны</option>
                            {availableCountries.map(country => (
                                <option key={country} value={country}>{country}</option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-section">
                        <label className="filter-label">Тип орбиты</label>
                        <select
                            value={filters.orbitType}
                            onChange={(e) => handleFilterChange('orbitType', e.target.value)}
                            className="filter-select"
                        >
                            <option value="">Все типы</option>
                            {availableOrbitTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-section">
                        <label className="filter-label">Назначение</label>
                        <select
                            value={filters.purpose}
                            onChange={(e) => handleFilterChange('purpose', e.target.value)}
                            className="filter-select"
                        >
                            <option value="">Все назначения</option>
                            {availablePurposes.map(purpose => (
                                <option key={purpose} value={purpose}>{purpose}</option>
                            ))}
                        </select>
                    </div>

                    {/* Статистика */}
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

                    {/* Блок скорости */}
                    <div className="speed-section">
                        <label className="filter-label">⚡ Скорость анимации</label>
                        <div className="speed-buttons">
                            <button className={`speed-btn ${currentSpeed === 1 ? 'active' : ''}`} onClick={() => onSpeedChange(1)}>1x</button>
                            <button className={`speed-btn ${currentSpeed === 5 ? 'active' : ''}`} onClick={() => onSpeedChange(5)}>5x</button>
                            <button className={`speed-btn ${currentSpeed === 10 ? 'active' : ''}`} onClick={() => onSpeedChange(10)}>10x</button>
                            <button className={`speed-btn ${currentSpeed === 100 ? 'active' : ''}`} onClick={() => onSpeedChange(100)}>100x</button>
                        </div>
                    </div>
                </>
            )}

            {/* Контент подписок */}
            {activeLeftTab === 'subscriptions' && (
                <div className="subscriptions-container" style={{ marginTop: '8px' }}>
                    <SubscriptionsPanel2D
                        subscriptions={subscriptions}
                        selectedPoint={selectedPoint}
                        selectedSatelliteId={null}
                        activeFilters={filters}
                        onCreateSubscription={onCreateSubscription}
                        loading={loadingAnalysis}
                    />
                </div>
            )}

            {/* Блок аналитики */}
        <div className="analytics-section" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#61dafb' }}>📊 Аналитика</h4>
            <AnalysisPanel2D
                currentTime={new Date()}
                selectedPoint={selectedPoint}
                selectedSatelliteId={null}
                activeFilters={filters}
                onRunPointAnalysis={onRunPointAnalysis}
                onRunRegionAnalysis={onRunRegionAnalysis}
                onRunCompareGroups={onRunCompareGroups}
                filterOptions={{
                    countries: [...new Set(satellites.map(s => s.country).filter(Boolean))],
                    orbit_types: [...new Set(satellites.map(s => s.orbit_type).filter(Boolean))],
                    purposes: [...new Set(satellites.map(s => s.purpose).filter(Boolean))]
                }}
                results={analysisResults}
                loading={loadingAnalysis}
                error={analysisError}
            />
        </div>
        </div>

            {/* ПРАВАЯ ПАНЕЛЬ - Пролёты */}
            <div className="sidebar-right">
                <div className="flyovers-header">
                    <h3>📡 Пролёты спутников</h3>
                    <div className="mode-switch">
                       <button
                        className={`mode-btn ${flyoverMode === 'point' ? 'active' : ''}`}
                        onClick={() => {
                            onPointSelect();  // вызывает переключение в родителе
                        }}
                    >
                        🖱️ По точке
                    </button>
                    <button
                        className={`mode-btn ${flyoverMode === 'country' ? 'active' : ''}`}
                        onClick={() => {
                            // Здесь нужно вызвать функцию для переключения в режим страны
                            // Если такой функции нет, можно передать onCountryModeSelect
                            onCountrySelect('');  // или другую функцию
                        }}
                    >
                        🌍 По странам
                    </button>
                    </div>
                </div>

                {/* Режим: по точке */}
                {flyoverMode === 'point' && (
                    <>
                        {!selectedPoint && (
                            <p className="flyovers-hint">
                                👆 Кликните на карту, чтобы выбрать точку
                            </p>
                        )}
                        {selectedPoint && (
                            <div className="selected-info">
                                📍 {selectedPoint.lat.toFixed(2)}°, {selectedPoint.lng.toFixed(2)}°
                            </div>
                        )}
                    </>
                )}

                {/* Режим: по странам */}
                {flyoverMode === 'country' && (
                    <>
                        {selectedCountry && (
                            <div className="selected-info">
                                🌍 {selectedCountry}
                            </div>
                        )}
                    </>
                )}

                {/* Загрузка */}
                {loadingFlyovers && (
                    <div className="loading">
                        ⏳ Расчёт пролётов...
                    </div>
                )}

                {/* Список пролётов */}
                {!loadingFlyovers && flyovers.length > 0 && (
                    <div className="flyovers-list">
                        <div className="flyovers-label">
                            Ближайшие пролёты (24 часа):
                        </div>
                        {flyovers.map((flyover, idx) => (
                            <div key={idx} className="flyover-item">
                                <div className="flyover-name"><strong>{flyover.satellite_name}</strong></div>
                                <div className="flyover-time">
                                    🕐 {new Date(flyover.flyover_time).toLocaleString()}
                                </div>
                                <div className="flyover-details">
                                    📊 {flyover.max_elevation}° | ⏱️ {flyover.duration_min} мин
                                </div>
                                <div className="flyover-meta">
                                    {flyover.country} • {flyover.purpose}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Нет пролётов */}
                {!loadingFlyovers && ((flyoverMode === 'point' && selectedPoint) || (flyoverMode === 'country' && selectedCountry)) && flyovers.length === 0 && (
                    <p className="no-flyovers">
                        ⚠️ Нет пролётов в ближайшие 24 часа
                    </p>
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