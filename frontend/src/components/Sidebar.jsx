import React, { useState, useEffect } from 'react';
import './Sidebar.css';

const Sidebar = ({ satellites, onFilterChange }) => {
    const [filters, setFilters] = useState({
        country: '',
        orbitType: '',
        purpose: ''
    });

    const [availableCountries, setAvailableCountries] = useState([]);
    const [availableOrbitTypes, setAvailableOrbitTypes] = useState([]);
    const [availablePurposes, setAvailablePurposes] = useState([]);

    // Извлекаем уникальные значения для фильтров
    useEffect(() => {
        if (satellites && satellites.length > 0) {
            const countries = [...new Set(satellites.map(sat => sat.country).filter(c => c))];
            const orbitTypes = [...new Set(satellites.map(sat => sat.orbit_type).filter(o => o))];
            const purposes = [...new Set(satellites.map(sat => sat.purpose).filter(p => p))];

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

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h3>Фильтры спутников</h3>
                <button className="clear-btn" onClick={clearFilters}>
                    Сбросить все
                </button>
            </div>

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

            <div className="stats-section">
                <h4>Статистика</h4>
                <div className="stat-item">
                    <span>Всего спутников:</span>
                    <strong>{satellites?.length || 0}</strong>
                </div>
                {filters.country && (
                    <div className="stat-item">
                        <span>Страна: {filters.country}</span>
                    </div>
                )}
                {filters.orbitType && (
                    <div className="stat-item">
                        <span>Орбита: {filters.orbitType}</span>
                    </div>
                )}
                {filters.purpose && (
                    <div className="stat-item">
                        <span>Назначение: {filters.purpose}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;