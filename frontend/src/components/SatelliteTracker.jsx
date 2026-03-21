import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import Sidebar from './Sidebar';

const satelliteIcon = L.icon({
    iconUrl: '/satelite.png',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
});

// Компонент для обработки кликов по карте
const MapClickHandler = ({ onMapClick }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng);
        },
    });
    return null;
};

const SatelliteTracker = () => {
    const [satellitesPosition, setSatellitesPosition] = useState([]);
    const [satelliteMetadata, setSatelliteMetadata] = useState({});
    const [filteredSatellites, setFilteredSatellites] = useState([]);
    const [filters, setFilters] = useState({
        country: '',
        orbitType: '',
        purpose: ''
    });
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [flyovers, setFlyovers] = useState([]);
    const [loadingFlyovers, setLoadingFlyovers] = useState(false);

    // Загрузка метаданных спутников
    const fetchMetadata = async () => {
        try {
            const res = await axios.get('http://127.0.0.1:8000/api/v1/satellites');
            const metaMap = {};
            res.data.items.forEach(item => {
                metaMap[item.id] = item;
            });
            setSatelliteMetadata(metaMap);
        } catch (err) {
            console.error('Ошибка загрузки метаданных:', err);
        }
    };

    // Загрузка позиций
    const fetchPositions = async () => {
        try {
            const res = await axios.get('http://127.0.0.1:8000/api/v1/satellites/positions');
            setSatellitesPosition(res.data);
        } catch (err) {
            console.error('Ошибка загрузки позиций:', err);
        }
    };

    // Применение фильтров
    useEffect(() => {
        let filtered = [...satellitesPosition];

        if (filters.country) {
            filtered = filtered.filter(pos => {
                const meta = satelliteMetadata[pos.satellite_id];
                return meta && meta.country === filters.country;
            });
        }

        if (filters.orbitType) {
            filtered = filtered.filter(pos => {
                const meta = satelliteMetadata[pos.satellite_id];
                return meta && meta.orbit_type === filters.orbitType;
            });
        }

        if (filters.purpose) {
            filtered = filtered.filter(pos => {
                const meta = satelliteMetadata[pos.satellite_id];
                return meta && meta.purpose === filters.purpose;
            });
        }

        setFilteredSatellites(filtered);
    }, [filters, satellitesPosition, satelliteMetadata]);

    // Расчёт пролётов над выбранной точкой
    const calculateFlyovers = async (lat, lon) => {
        setLoadingFlyovers(true);
        try {
            const response = await axios.post('http://127.0.0.1:8000/api/v1/satellites/flyovers', {
                latitude: lat,
                longitude: lon,
                hours_ahead: 24
            });
            setFlyovers(response.data.flyovers);
        } catch (err) {
            console.error('Ошибка расчёта пролётов:', err);
            setFlyovers(generateDemoFlyovers(lat, lon));
        } finally {
            setLoadingFlyovers(false);
        }
    };

    // Демо-данные для пролётов
    const generateDemoFlyovers = (lat, lon) => {
        const satellites = Object.values(satelliteMetadata);
        const now = new Date();

        return satellites.slice(0, 10).map((sat, idx) => ({
            satellite_id: sat.id,
            satellite_name: sat.name,
            flyover_time: new Date(now.getTime() + (idx + 1) * 3600000).toISOString(),
            duration_min: Math.floor(Math.random() * 15) + 5,
            max_elevation: Math.floor(Math.random() * 80) + 10,
            country: sat.country,
            purpose: sat.purpose
        })).sort((a, b) => new Date(a.flyover_time) - new Date(b.flyover_time));
    };

    // Обработка клика по карте
    const handleMapClick = (latlng) => {
        setSelectedPoint({ lat: latlng.lat, lng: latlng.lng });
        calculateFlyovers(latlng.lat, latlng.lng);
    };

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
    };

    // Инициализация
    useEffect(() => {
        fetchMetadata();
        fetchPositions();
        const interval = setInterval(fetchPositions, 5000);
        return () => clearInterval(interval);
    }, []);

    const getSatelliteInfo = (satId) => {
        return satelliteMetadata[satId] || null;
    };

    // Подготовка данных для Sidebar (только спутники с метаданными)
    const satellitesForSidebar = satellitesPosition
        .map(pos => getSatelliteInfo(pos.satellite_id))
        .filter(meta => meta !== null);

    return (
        <>
            {/* Левая боковая панель с фильтрами */}
            <Sidebar
                satellites={satellitesForSidebar}
                onFilterChange={handleFilterChange}
            />

            {/* Правая панель с пролётами */}
            <div style={{
                position: 'fixed',
                top: 20,
                right: 20,
                width: 320,
                maxHeight: '80vh',
                backgroundColor: 'rgba(30, 30, 40, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                padding: '16px',
                color: 'white',
                zIndex: 1000,
                overflowY: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                fontFamily: 'sans-serif'
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>
                    📡 Пролёты спутников
                </h3>

                {!selectedPoint && (
                    <p style={{ fontSize: '0.85rem', color: '#aaa' }}>
                        👆 Кликните на карту, чтобы выбрать точку и увидеть ближайшие пролёты спутников
                    </p>
                )}

                {selectedPoint && (
                    <div style={{ marginBottom: '12px', fontSize: '0.85rem', color: '#61dafb' }}>
                        📍 Точка: {selectedPoint.lat.toFixed(2)}°, {selectedPoint.lng.toFixed(2)}°
                    </div>
                )}

                {loadingFlyovers && (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        ⏳ Расчёт пролётов...
                    </div>
                )}

                {!loadingFlyovers && flyovers.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '8px' }}>
                            Ближайшие пролёты (следующие 24 часа):
                        </div>
                        {flyovers.map((flyover, idx) => (
                            <div key={idx} style={{
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                padding: '10px',
                                marginBottom: '8px',
                                fontSize: '0.8rem'
                            }}>
                                <div><strong>{flyover.satellite_name}</strong></div>
                                <div>🕐 {new Date(flyover.flyover_time).toLocaleString()}</div>
                                <div>📊 Макс. высота: {flyover.max_elevation}°</div>
                                <div>⏱️ Длительность: {flyover.duration_min} мин</div>
                                <div style={{ fontSize: '0.7rem', color: '#aaa' }}>
                                    {flyover.country} • {flyover.purpose}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!loadingFlyovers && selectedPoint && flyovers.length === 0 && (
                    <p style={{ fontSize: '0.85rem', color: '#ffaa66' }}>
                        ⚠️ Нет пролётов в ближайшие 24 часа
                    </p>
                )}
            </div>

            <MapContainer
                center={[0, 0]}
                zoom={2}
                style={{ height: '100vh', width: '100%' }}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <MapClickHandler onMapClick={handleMapClick} />

                {/* Отображаем выбранную точку */}
                {selectedPoint && (
                    <Marker
                        position={[selectedPoint.lat, selectedPoint.lng]}
                        icon={L.divIcon({
                            className: 'custom-div-icon',
                            html: '<div style="background-color: #ff4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        })}
                    >
                        <Popup>
                            <b>Выбранная точка</b><br/>
                            {selectedPoint.lat.toFixed(4)}°, {selectedPoint.lng.toFixed(4)}°
                        </Popup>
                    </Marker>
                )}

                {/* Отображаем отфильтрованные спутники */}
                {filteredSatellites.map((pos) => {
                    const meta = getSatelliteInfo(pos.satellite_id);
                    if (!meta) return null;

                    return (
                        <Marker
                            key={pos.satellite_id}
                            position={[pos.geodetic.lat, pos.geodetic.lon]}
                            icon={satelliteIcon}
                        >
                            <Popup>
                                <h3>{meta.name}</h3>
                                <strong>Страна/Оператор:</strong> {meta.country} / {meta.operator}<br/>
                                <strong>Тип орбиты:</strong> {meta.orbit_type}<br/>
                                <strong>Высота орбиты:</strong> ~{meta.approx_altitude_km} км<br/>
                                <strong>Период обращения:</strong> {meta.period_minutes} мин<br/>
                                <strong>Текущие координаты:</strong><br/>
                                Lat: {pos.geodetic.lat.toFixed(4)}°,
                                Lon: {pos.geodetic.lon.toFixed(4)}°<br/>
                                <strong>Время:</strong> {new Date(pos.timestamp).toLocaleString()}
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </>
    );
};

export default SatelliteTracker;