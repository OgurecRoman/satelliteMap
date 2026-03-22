import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';

// Используем useMapEvents для обработки кликов на карте
function MapClickHandler({ onClick }) {
    useMapEvents({
        click: onClick,
    });
    return null; // Этот компонент ничего не рендерит на карте
}

// Иконка спутника
const baseSatelliteIcon = {
    iconUrl: '/satelite.png',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
};

const getRotatedIcon = (angle) => {
    const rotationStyle = {
        transform: `rotate(${angle}deg)`,
        WebkitTransform: `rotate(${angle}deg)`,
        MozTransform: `rotate(${angle}deg)`,
    };

    return L.divIcon({
        html: `<img src="${baseSatelliteIcon.iconUrl}" style="width: ${baseSatelliteIcon.iconSize[0]}px; height: ${baseSatelliteIcon.iconSize[1]}px; ${Object.entries(rotationStyle).map(([k, v]) => `${k}:${v};`).join('')}" />`,
        iconSize: baseSatelliteIcon.iconSize,
        iconAnchor: baseSatelliteIcon.iconAnchor,
        popupAnchor: baseSatelliteIcon.popupAnchor,
        className: 'rotating-sat-icon'
    });
};

const calculateBearingFromVelocity = (pos) => {
    if (!pos.velocity || typeof pos.velocity.vx === 'undefined' || typeof pos.velocity.vy === 'undefined') {
        return 0;
    }

    let vx = pos.velocity.vx;
    let vy = pos.velocity.vy;

    if (Math.abs(vx) < 1e-10 && Math.abs(vy) < 1e-10) {
        return 0;
    }

    let bearingRad = Math.atan2(vy, vx);
    let bearingDeg = bearingRad * (180 / Math.PI);
    bearingDeg = (bearingDeg + 180) % 360;

    return bearingDeg;
};

const SatelliteTracker = () => {
    const [satellitesPosition, setSatellitesPosition] = useState([]);
    const [satelliteMetadata, setSatelliteMetadata] = useState({});
    const [selectedSatelliteId, setSelectedSatelliteId] = useState(null);
    const [currentTrajectory, setCurrentTrajectory] = useState([]);

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

    const fetchPositions = async () => {
        try {
            const res = await axios.get('http://127.0.0.1:8000/api/v1/satellites/positions');
            setSatellitesPosition(res.data);
        } catch (err) {
            console.error('Ошибка загрузки позиций:', err);
        }
    };

    const fetchTrajectory = async (satelliteId) => {
        const now = new Date();
        const startTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        try {
            const response = await axios.get(`http://127.0.0.1:8000/api/v1/satellites/${satelliteId}/track`, {
                params: {
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString()
                }
            });

            const apiResponse = response.data;
            const trajectoryData = apiResponse.points;

            if (Array.isArray(trajectoryData)) {
                 const validPoints = trajectoryData.filter(point =>
                     point.geodetic &&
                     typeof point.geodetic.lat === 'number' &&
                     typeof point.geodetic.lon === 'number' &&
                     !isNaN(point.geodetic.lat) &&
                     !isNaN(point.geodetic.lon)
                 ).map(point => ({
                     lat: point.geodetic.lat,
                     lon: point.geodetic.lon
                 }));

                 if (validPoints.length > 0) {
                     setCurrentTrajectory(validPoints);
                 } else {
                     console.warn(`Нет действительных точек траектории для спутника ${satelliteId}.`);
                     setCurrentTrajectory([]);
                 }
            } else {
                console.warn(`Поле 'points' для спутника ${satelliteId} не является массивом или отсутствует.`);
                setCurrentTrajectory([]);
            }
        } catch (err) {
            console.error(`Ошибка загрузки траектории для спутника ${satelliteId}:`, err);
            setCurrentTrajectory([]);
        }
    };

    useEffect(() => {
        fetchMetadata();
        const positionInterval = setInterval(fetchPositions, 5000);
        return () => clearInterval(positionInterval);
    }, []);

    useEffect(() => {
        if (selectedSatelliteId !== null) {
            fetchTrajectory(selectedSatelliteId);
        } else {
            setCurrentTrajectory([]); // Очищаем траекторию, если спутник не выбран
        }
    }, [selectedSatelliteId]);

    const getSatelliteInfo = (satId) => {
        return satelliteMetadata[satId] || null;
    };

    const handleSatelliteClick = (satId) => {
        // Если кликнули на уже выбранный спутник, снимаем выбор
        if (selectedSatelliteId === satId) {
            setSelectedSatelliteId(null);
        } else {
            setSelectedSatelliteId(satId);
        }
    };

    // Обработчик клика по карте (не по маркеру)
    const handleMapClick = () => {
        setSelectedSatelliteId(null); // Снимаем выбор со спутника
    };

    return (
        <MapContainer
            center={[0, 0]}
            zoom={2}
            style={{ height: '100vh', width: '100%' }}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            {/* Добавляем компонент для обработки кликов по карте */}
            <MapClickHandler onClick={handleMapClick} />

            {/* Рендерим траекторию, если она есть и есть выбранный спутник */}
            {currentTrajectory.length > 1 && selectedSatelliteId && (
                <Polyline
                    positions={currentTrajectory.map(p => [p.lat, p.lon])}
                    color="#ff7800"
                    weight={2}
                    dashArray="5, 5"
                    interactive={false}
                />
            )}

            {/* Рендерим маркеры спутников */}
            {satellitesPosition.map((pos) => {
                const meta = getSatelliteInfo(pos.satellite_id);
                if (!meta) return null;

                const isSelected = selectedSatelliteId === pos.satellite_id;
                const bearing = calculateBearingFromVelocity(pos);
                const rotatedIcon = getRotatedIcon(bearing);

                return (
                    <Marker
                        key={pos.satellite_id}
                        position={[pos.geodetic.lat, pos.geodetic.lon]}
                        icon={rotatedIcon}
                        eventHandlers={{
                            click: () => handleSatelliteClick(pos.satellite_id),
                        }}
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
                            {pos.velocity && (
                                <>
                                    <strong>Скорость (Vx, Vy):</strong> {pos.velocity.vx?.toFixed(4) || 'N/A'}, {pos.velocity.vy?.toFixed(4) || 'N/A'}<br/>
                                    <strong>Курс (расчётный):</strong> {(bearing).toFixed(2)}°<br/>
                                </>
                            )}
                            <strong>Время:</strong> {new Date(pos.timestamp).toLocaleString()}<br/>
                            <em>{isSelected ? '(Траектория отображена)' : '(Кликните для просмотра траектории)'}</em>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
};

export default SatelliteTracker;