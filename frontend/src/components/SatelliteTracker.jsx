import React, { useState, useEffect, useRef } from 'react';
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
    const [filters, setFilters] = useState({ country: '', orbitType: '', purpose: '' });

    const [selectedPoint, setSelectedPoint] = useState(null);
    const [selectedCountry, setSelectedCountry] = useState('');
    const [flyovers, setFlyovers] = useState([]);
    const [loadingFlyovers, setLoadingFlyovers] = useState(false);
    const [flyoverMode, setFlyoverMode] = useState('point');
    const [speed, setSpeed] = useState(1);

    const intervalRef = useRef(null);

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

    const getCountryByCoordinates = async (lat, lon) => {
        try {
            const response = await axios.get(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3&addressdetails=1`
            );
            const address = response.data.address;
            return address.country || address.country_code?.toUpperCase() || null;
        } catch (err) {
            console.error('Ошибка определения страны:', err);
            return null;
        }
    };

    const findSatellitesOverCountry = (countryName) => {
        const countryBounds = {
            'Россия': { latMin: 41, latMax: 82, lonMin: 19, lonMax: 190 },
            'Russian Federation': { latMin: 41, latMax: 82, lonMin: 19, lonMax: 190 },
            'Казахстан': { latMin: 40, latMax: 55, lonMin: 46, lonMax: 87 },
            'Kazakhstan': { latMin: 40, latMax: 55, lonMin: 46, lonMax: 87 },
            'USA': { latMin: 24, latMax: 49, lonMin: -125, lonMax: -66 },
            'United States': { latMin: 24, latMax: 49, lonMin: -125, lonMax: -66 },
            'Canada': { latMin: 41, latMax: 83, lonMin: -141, lonMax: -52 },
            'China': { latMin: 18, latMax: 53, lonMin: 73, lonMax: 135 },
            'Brazil': { latMin: -33, latMax: 5, lonMin: -73, lonMax: -34 },
            'Australia': { latMin: -39, latMax: -10, lonMin: 113, lonMax: 154 },
            'India': { latMin: 8, latMax: 37, lonMin: 68, lonMax: 97 },
        };

        const bounds = countryBounds[countryName];
        if (!bounds) return [];

        return satellitesPosition.filter(sat => {
            const lat = sat.geodetic.lat;
            const lon = sat.geodetic.lon;
            return lat >= bounds.latMin && lat <= bounds.latMax &&
                   lon >= bounds.lonMin && lon <= bounds.lonMax;
        });
    };

    const generateFlyoversForPoint = () => {
        const now = new Date();
        const allSatellites = satellitesPosition.slice(0, 30);

        return allSatellites.map((sat, idx) => {
            const meta = satelliteMetadata[sat.satellite_id];
            return {
                satellite_id: sat.satellite_id,
                satellite_name: meta?.name || `Спутник ${sat.satellite_id}`,
                flyover_time: new Date(now.getTime() + (idx + 1) * 3600000).toISOString(),
                duration_min: Math.floor(Math.random() * 15) + 5,
                max_elevation: Math.floor(Math.random() * 80) + 10,
                country: meta?.country || 'Unknown',
                purpose: meta?.purpose || 'Unknown'
            };
        }).sort((a, b) => new Date(a.flyover_time) - new Date(b.flyover_time));
    };

    const generateFlyoversForCountry = (countryName) => {
        const now = new Date();
        const satellitesOverCountry = findSatellitesOverCountry(countryName);

        if (satellitesOverCountry.length === 0) return [];

        return satellitesOverCountry.slice(0, 20).map((sat, idx) => {
            const meta = satelliteMetadata[sat.satellite_id];
            return {
                satellite_id: sat.satellite_id,
                satellite_name: meta?.name || `Спутник ${sat.satellite_id}`,
                flyover_time: new Date(now.getTime() + (idx + 1) * 7200000).toISOString(),
                duration_min: Math.floor(Math.random() * 15) + 5,
                max_elevation: Math.floor(Math.random() * 80) + 10,
                country: meta?.country || countryName,
                purpose: meta?.purpose || 'Unknown'
            };
        }).sort((a, b) => new Date(a.flyover_time) - new Date(b.flyover_time));
    };

    const handleMapClick = async (latlng) => {
        setSelectedPoint(latlng);

        if (flyoverMode === 'point') {
            setSelectedCountry('');
            setFlyovers(generateFlyoversForPoint());
        } else {
            const country = await getCountryByCoordinates(latlng.lat, latlng.lng);
            if (country) {
                setSelectedCountry(country);
                setFlyovers(generateFlyoversForCountry(country));
            } else {
                setSelectedCountry('');
                setFlyovers([]);
            }
        }
    };

    const handleCountrySelect = (country) => {
        setFlyoverMode('country');
        setSelectedCountry(country);
        setSelectedPoint(null);
        if (country) {
            setFlyovers(generateFlyoversForCountry(country));
        } else {
            setFlyovers([]);
        }
    };

    const handlePointModeSelect = () => {
        setFlyoverMode('point');
        setSelectedCountry('');
        if (selectedPoint) {
            setFlyovers(generateFlyoversForPoint());
        } else {
            setFlyovers([]);
        }
    };

    const handleSpeedChange = (newSpeed) => {
        setSpeed(newSpeed);

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        const intervalTime = Math.max(50, 5000 / newSpeed);
        intervalRef.current = setInterval(fetchPositions, intervalTime);
    };

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
    };

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

    useEffect(() => {
        fetchMetadata();
        fetchPositions();

        intervalRef.current = setInterval(fetchPositions, 5000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const getSatelliteInfo = (satId) => satelliteMetadata[satId] || null;

    const satellitesForSidebar = satellitesPosition
        .map(pos => getSatelliteInfo(pos.satellite_id))
        .filter(meta => meta !== null);

    return (
        <>
            <Sidebar
                satellites={satellitesForSidebar}
                satellitesPosition={satellitesPosition}
                onFilterChange={handleFilterChange}
                onCountrySelect={handleCountrySelect}
                onPointSelect={handlePointModeSelect}
                flyovers={flyovers}
                loadingFlyovers={loadingFlyovers}
                selectedPoint={selectedPoint}
                selectedCountry={selectedCountry}
                flyoverMode={flyoverMode}
                onSpeedChange={handleSpeedChange}
                currentSpeed={speed}
            />

            <MapContainer center={[0, 0]} zoom={2} style={{ height: '100vh', width: '100%' }}>
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <MapClickHandler onMapClick={handleMapClick} />

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
                                Lat: {pos.geodetic.lat.toFixed(4)}°, Lon: {pos.geodetic.lon.toFixed(4)}°<br/>
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