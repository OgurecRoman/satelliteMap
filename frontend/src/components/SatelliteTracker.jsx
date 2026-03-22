import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Circle,
    MapContainer,
    Marker,
    Polygon,
    Polyline,
    Popup,
    TileLayer,
    ZoomControl,
    useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import Sidebar from './Sidebar';
import {
    runPointPassAnalysis,
    runRegionPassAnalysis,
    runCompareGroups as requestCompareGroups,
} from '../api/analysis';
import { listSubscriptions } from '../api/notifications';
import {
    footprintAngularRadiusDeg,
    sphericalCirclePolygon,
    surfaceRadiusKmFromAngularRadiusDeg,
} from '../utils/coordinates';

const MapClickHandler = ({ onMapClick }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng);
        },
    });
    return null;
};

const baseSatelliteIcon = {
    iconUrl: '/satelite.png',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
};

const normalizePoint = (point) => {
    if (!point) return null;
    const lon = typeof point.lon === 'number' ? point.lon : point.lng;
    return {
        lat: point.lat,
        lon,
        lng: lon,
    };
};

const polygonToLeafletPositions = (polygon) => {
    const ring = polygon?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 3) return [];
    return ring
        .filter((coord) => Array.isArray(coord) && coord.length >= 2)
        .map(([lon, lat]) => [lat, lon]);
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
        className: 'rotating-sat-icon',
    });
};

const calculateBearingFromVelocity = (pos) => {
    if (!pos.velocity || typeof pos.velocity.vx === 'undefined' || typeof pos.velocity.vy === 'undefined') {
        return 0;
    }

    const { vx, vy } = pos.velocity;

    if (Math.abs(vx) < 1e-10 && Math.abs(vy) < 1e-10) {
        return 0;
    }

    const bearingRad = Math.atan2(vy, vx);
    let bearingDeg = bearingRad * (180 / Math.PI);
    bearingDeg = (bearingDeg + 180) % 360;

    return bearingDeg;
};

const SatelliteTracker = () => {
    const [satellitesPosition, setSatellitesPosition] = useState([]);
    const [satelliteMetadata, setSatelliteMetadata] = useState({});
    const [filteredSatellites, setFilteredSatellites] = useState([]);
    const [filters, setFilters] = useState({
        country: '',
        orbitType: '',
        purpose: '',
    });

    const [selectedPoint, setSelectedPoint] = useState(null);
    const [selectedCountry, setSelectedCountry] = useState('');
    const [flyovers, setFlyovers] = useState([]);
    const [loadingFlyovers, setLoadingFlyovers] = useState(false);
    const [flyoverMode, setFlyoverMode] = useState('point');
    const [speed, setSpeed] = useState(1);
    const [minElevationDeg, setMinElevationDeg] = useState(15);

    const [analysisResults, setAnalysisResults] = useState({
        point: null,
        region: null,
        compare: null,
    });
    const [subscriptions, setSubscriptions] = useState([]);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [analysisError, setAnalysisError] = useState('');

    const [coverageFootprint, setCoverageFootprint] = useState(null);
    const [selectedSatelliteId, setSelectedSatelliteId] = useState(null);
    const [visibilityFootprint, setVisibilityFootprint] = useState(null);
    const [currentTrajectory, setCurrentTrajectory] = useState([]);
    const intervalRef = useRef(null);

    const selectedSatellitePosition = useMemo(
        () => satellitesPosition.find((sat) => sat.satellite_id === selectedSatelliteId) || null,
        [satellitesPosition, selectedSatelliteId]
    );

    const selectedSatelliteName = useMemo(() => {
        if (!selectedSatelliteId) return '';
        return satelliteMetadata[selectedSatelliteId]?.name || `Спутник ${selectedSatelliteId}`;
    }, [satelliteMetadata, selectedSatelliteId]);

    const workingFootprint = useMemo(() => {
        const geodetic = selectedSatellitePosition?.geodetic;
        if (!geodetic || !Number.isFinite(geodetic.alt_km)) {
            return null;
        }

        const angularRadiusDeg = footprintAngularRadiusDeg(geodetic.alt_km, 'min_elevation', minElevationDeg);
        const radiusKm = surfaceRadiusKmFromAngularRadiusDeg(angularRadiusDeg);

        return {
            center: { lat: geodetic.lat, lon: geodetic.lon },
            angular_radius_deg: angularRadiusDeg,
            radius_km: radiusKm,
            polygon: {
                type: 'Polygon',
                coordinates: [sphericalCirclePolygon(geodetic.lat, geodetic.lon, angularRadiusDeg, 96)],
            },
        };
    }, [minElevationDeg, selectedSatellitePosition]);

    const visibilityPolygonPositions = useMemo(
        () => polygonToLeafletPositions(visibilityFootprint?.polygon),
        [visibilityFootprint]
    );

    const workingPolygonPositions = useMemo(
        () => polygonToLeafletPositions(workingFootprint?.polygon),
        [workingFootprint]
    );

    const fetchMetadata = async () => {
        try {
            const res = await axios.get('http://127.0.0.1:8000/api/v1/satellites');
            const metaMap = {};
            res.data.items.forEach((item) => {
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
            Россия: { latMin: 41, latMax: 82, lonMin: 19, lonMax: 190 },
            'Russian Federation': { latMin: 41, latMax: 82, lonMin: 19, lonMax: 190 },
            Казахстан: { latMin: 40, latMax: 55, lonMin: 46, lonMax: 87 },
            Kazakhstan: { latMin: 40, latMax: 55, lonMin: 46, lonMax: 87 },
            USA: { latMin: 24, latMax: 49, lonMin: -125, lonMax: -66 },
            'United States': { latMin: 24, latMax: 49, lonMin: -125, lonMax: -66 },
            Canada: { latMin: 41, latMax: 83, lonMin: -141, lonMax: -52 },
            China: { latMin: 18, latMax: 53, lonMin: 73, lonMax: 135 },
            Brazil: { latMin: -33, latMax: 5, lonMin: -73, lonMax: -34 },
            Australia: { latMin: -39, latMax: -10, lonMin: 113, lonMax: 154 },
            India: { latMin: 8, latMax: 37, lonMin: 68, lonMax: 97 },
        };

        const bounds = countryBounds[countryName];
        if (!bounds) return [];

        return satellitesPosition.filter((sat) => {
            const lat = sat.geodetic.lat;
            const lon = sat.geodetic.lon;
            return lat >= bounds.latMin && lat <= bounds.latMax && lon >= bounds.lonMin && lon <= bounds.lonMax;
        });
    };

    const generateFlyoversForCountry = (countryName) => {
        const now = new Date();
        const satellitesOverCountry = findSatellitesOverCountry(countryName);

        if (satellitesOverCountry.length === 0) return [];

        return satellitesOverCountry
            .slice(0, 20)
            .map((sat, idx) => {
                const meta = satelliteMetadata[sat.satellite_id];
                return {
                    satellite_id: sat.satellite_id,
                    satellite_name: meta?.name || `Спутник ${sat.satellite_id}`,
                    flyover_time: new Date(now.getTime() + (idx + 1) * 7200000).toISOString(),
                    duration_min: Math.floor(Math.random() * 15) + 5,
                    max_elevation: Math.floor(Math.random() * 80) + 10,
                    country: meta?.country || countryName,
                    purpose: meta?.purpose || 'Unknown',
                };
            })
            .sort((a, b) => new Date(a.flyover_time) - new Date(b.flyover_time));
    };

    const runPointAnalysis = async (payload) => {
        setLoadingAnalysis(true);
        setAnalysisError('');
        try {
            const data = await runPointPassAnalysis(payload);
            setAnalysisResults((prev) => ({ ...prev, point: data }));
        } catch (err) {
            setAnalysisError(err?.response?.data?.detail || err.message);
        } finally {
            setLoadingAnalysis(false);
        }
    };

    const runRegionAnalysis = async (payload) => {
        setLoadingAnalysis(true);
        setAnalysisError('');
        try {
            const data = await runRegionPassAnalysis(payload);
            setAnalysisResults((prev) => ({ ...prev, region: data }));
        } catch (err) {
            setAnalysisError(err?.response?.data?.detail || err.message);
        } finally {
            setLoadingAnalysis(false);
        }
    };

    const handleRunCompareGroups = async (payload) => {
        setLoadingAnalysis(true);
        setAnalysisError('');
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Превышено время ожидания (30 сек)')), 30000)
            );

            const apiPromise = requestCompareGroups(payload);
            const data = await Promise.race([apiPromise, timeoutPromise]);
            setAnalysisResults((prev) => ({ ...prev, compare: data }));
        } catch (err) {
            console.error('Ошибка сравнения:', err);
            setAnalysisError(err?.response?.data?.detail || err.message || 'Ошибка при сравнении группировок');
        } finally {
            setLoadingAnalysis(false);
        }
    };

    const fetchSubscriptions = async () => {
        try {
            const data = await listSubscriptions();
            setSubscriptions(data || []);
        } catch (err) {
            console.error('Ошибка загрузки подписок:', err);
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

    const handlePointModeSelect = async () => {
        setFlyoverMode('point');
        setSelectedCountry('');
        if (selectedPoint) {
            await calculateRealFlyovers(selectedPoint.lat, selectedPoint.lon);
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

    const handleMapClick = async (latlng) => {
        const normalizedPoint = normalizePoint(latlng);
        setSelectedPoint(normalizedPoint);
        setSelectedSatelliteId(null);
        setCoverageFootprint(null);
        setVisibilityFootprint(null);

        if (flyoverMode === 'point') {
            setSelectedCountry('');
            await calculateRealFlyovers(normalizedPoint.lat, normalizedPoint.lon);
        } else {
            const country = await getCountryByCoordinates(normalizedPoint.lat, normalizedPoint.lon);
            if (country) {
                setSelectedCountry(country);
                await calculateRealFlyoversForCountry(country);
            } else {
                setSelectedCountry('');
                setFlyovers([]);
            }
        }
    };

    const clearSelectedPoint = useCallback(() => {
        setSelectedPoint(null);
        if (flyoverMode === 'point') {
            setFlyovers([]);
        }
    }, [flyoverMode]);

    const calculateRealFlyovers = async (lat, lon) => {
        setLoadingFlyovers(true);
        try {
            const data = await runPointPassAnalysis({
                lat,
                lon,
                from_time: new Date().toISOString(),
                horizon_hours: 6,
                step_seconds: 600,
                filters: {},
            });

            const formattedFlyovers = (data.matches || []).map((match) => ({
                satellite_id: match.satellite.id,
                satellite_name: match.satellite.name,
                flyover_time: match.next_pass?.enter_time || new Date().toISOString(),
                duration_min:
                    Math.round((new Date(match.next_pass?.exit_time) - new Date(match.next_pass?.enter_time)) / 60000) || 10,
                max_elevation: Math.round(90 - (match.next_pass?.min_distance_km / 111) * 0.8) || 45,
                country: match.satellite.country,
                purpose: match.satellite.purpose,
            }));

            setFlyovers(formattedFlyovers);
        } catch (err) {
            console.error('Ошибка расчёта пролётов:', err);
            setFlyovers(generateDemoFlyovers(lat, lon));
        } finally {
            setLoadingFlyovers(false);
        }
    };

    const calculateRealFlyoversForCountry = async (countryName) => {
        setLoadingFlyovers(true);
        try {
            const countryCenters = {
                Россия: { lat: 61.5, lon: 105 },
                'Russian Federation': { lat: 61.5, lon: 105 },
                Казахстан: { lat: 48, lon: 68 },
                Kazakhstan: { lat: 48, lon: 68 },
                USA: { lat: 39.8, lon: -98.6 },
                'United States': { lat: 39.8, lon: -98.6 },
                China: { lat: 35, lon: 105 },
                Китай: { lat: 35, lon: 105 },
            };

            const center = countryCenters[countryName];
            if (!center) {
                setFlyovers([]);
                setLoadingFlyovers(false);
                return;
            }

            await calculateRealFlyovers(center.lat, center.lon);
        } catch (err) {
            console.error('Ошибка расчёта пролётов для страны:', err);
            setFlyovers([]);
            setLoadingFlyovers(false);
        }
    };

    const generateDemoFlyovers = () => {
        const now = new Date();
        const allSatellites = satellitesPosition.slice(0, 30);
        return allSatellites
            .map((sat, idx) => {
                const meta = satelliteMetadata[sat.satellite_id];
                return {
                    satellite_id: sat.satellite_id,
                    satellite_name: meta?.name || `Спутник ${sat.satellite_id}`,
                    flyover_time: new Date(now.getTime() + (idx + 1) * 3600000).toISOString(),
                    duration_min: Math.floor(Math.random() * 15) + 5,
                    max_elevation: Math.floor(Math.random() * 80) + 10,
                    country: meta?.country || 'Unknown',
                    purpose: meta?.purpose || 'Unknown',
                };
            })
            .sort((a, b) => new Date(a.flyover_time) - new Date(b.flyover_time));
    };

    const fetchCoverage = useCallback(async (satelliteId) => {
        try {
            const currentSat = satellitesPosition.find((sat) => sat.satellite_id === satelliteId);
            if (!currentSat) return;

            const res = await axios.get(`http://127.0.0.1:8000/api/v1/satellites/${satelliteId}/coverage`, {
                params: {
                    lat: currentSat.geodetic.lat,
                    lon: currentSat.geodetic.lon,
                    timestamp: currentSat.timestamp,
                },
            });

            setCoverageFootprint(res.data);
        } catch (err) {
            console.error('Ошибка загрузки зоны покрытия:', err);
            setCoverageFootprint(null);
        }
    }, [satellitesPosition]);

    const fetchTrajectory = async (satelliteId) => {
        const now = new Date();
        const startTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        try {
            const response = await axios.get(`http://127.0.0.1:8000/api/v1/satellites/${satelliteId}/track`, {
                params: {
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString(),
                },
            });

            const trajectoryData = response.data?.points;

            if (Array.isArray(trajectoryData)) {
                const validPoints = trajectoryData
                    .filter(
                        (point) =>
                            point.geodetic
                            && typeof point.geodetic.lat === 'number'
                            && typeof point.geodetic.lon === 'number'
                            && !Number.isNaN(point.geodetic.lat)
                            && !Number.isNaN(point.geodetic.lon)
                    )
                    .map((point) => ({
                        lat: point.geodetic.lat,
                        lon: point.geodetic.lon,
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

    const fetchVisibility = async (satelliteId) => {
        try {
            const res = await axios.get(`http://127.0.0.1:8000/api/v1/satellites/${satelliteId}/visibility`);
            setVisibilityFootprint(res.data);
        } catch (err) {
            console.error('Ошибка загрузки зоны радиовидимости:', err);
            setVisibilityFootprint(null);
        }
    };

    useEffect(() => {
        let filtered = [...satellitesPosition];

        if (filters.country) {
            filtered = filtered.filter((pos) => {
                const meta = satelliteMetadata[pos.satellite_id];
                return meta && meta.country === filters.country;
            });
        }
        if (filters.orbitType) {
            filtered = filtered.filter((pos) => {
                const meta = satelliteMetadata[pos.satellite_id];
                return meta && meta.orbit_type === filters.orbitType;
            });
        }
        if (filters.purpose) {
            filtered = filtered.filter((pos) => {
                const meta = satelliteMetadata[pos.satellite_id];
                return meta && meta.purpose === filters.purpose;
            });
        }
        setFilteredSatellites(filtered);
    }, [filters, satellitesPosition, satelliteMetadata]);

    useEffect(() => {
        fetchMetadata();
        fetchPositions();
        fetchSubscriptions();

        intervalRef.current = setInterval(fetchPositions, 5000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!selectedSatelliteId) return;

        const currentSatellite = satellitesPosition.find((sat) => sat.satellite_id === selectedSatelliteId);
        if (currentSatellite) {
            fetchCoverage(selectedSatelliteId);
            fetchVisibility(selectedSatelliteId);
        }
    }, [fetchCoverage, satellitesPosition, selectedSatelliteId]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
            if (event.code === 'Space') {
                event.preventDefault();
                clearSelectedPoint();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clearSelectedPoint]);

    useEffect(() => {
        if (selectedSatelliteId !== null) {
            fetchTrajectory(selectedSatelliteId);
        } else {
            setCurrentTrajectory([]);
        }
    }, [selectedSatelliteId]);

    const satellitesForSidebar = Object.values(satelliteMetadata).filter((meta) => meta !== null);

    const getSatelliteInfo = (satId) => satelliteMetadata[satId] || null;

    const handleSatelliteClick = (satelliteId) => {
        if (selectedSatelliteId === satelliteId) {
            setSelectedSatelliteId(null);
            setVisibilityFootprint(null);
            setCoverageFootprint(null);
        } else {
            setSelectedSatelliteId(satelliteId);
            fetchCoverage(satelliteId);
            fetchVisibility(satelliteId);
        }
    };

    return (
        <div>
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
                analysisResults={analysisResults}
                onRunPointAnalysis={runPointAnalysis}
                onRunRegionAnalysis={runRegionAnalysis}
                onRunCompareGroups={handleRunCompareGroups}
                loadingAnalysis={loadingAnalysis}
                analysisError={analysisError}
                subscriptions={subscriptions}
                selectedSatelliteId={selectedSatelliteId}
                selectedSatelliteName={selectedSatelliteName}
                minElevationDeg={minElevationDeg}
                onMinElevationChange={(value) => setMinElevationDeg(Math.max(0, Math.min(45, value)))}
            />

            <MapContainer center={[0, 0]} zoom={2} zoomControl={false} style={{ height: '100vh', width: '100%' }}>
                <ZoomControl position="bottomleft" />
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <MapClickHandler onMapClick={handleMapClick} />

                {currentTrajectory.length > 1 && selectedSatelliteId && (
                    <Polyline
                        positions={currentTrajectory.map((p) => [p.lat, p.lon])}
                        color="#ff7800"
                        weight={2}
                        dashArray="5, 5"
                        interactive={false}
                    />
                )}

                {selectedPoint && (
                    <Marker
                        position={[selectedPoint.lat, selectedPoint.lng]}
                        icon={L.divIcon({
                            className: 'custom-div-icon',
                            html: '<div style="background-color: #ff4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                            iconSize: [12, 12],
                            iconAnchor: [6, 6],
                        })}
                    >
                        <Popup>
                            <b>Выбранная точка</b>
                            <br />
                            {selectedPoint.lat.toFixed(4)}°, {selectedPoint.lng.toFixed(4)}°
                        </Popup>
                    </Marker>
                )}

                {filteredSatellites.map((pos) => {
                    const meta = getSatelliteInfo(pos.satellite_id);
                    if (!meta) return null;

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
                                <strong>Страна/Оператор:</strong> {meta.country} / {meta.operator}
                                <br />
                                <strong>Тип орбиты:</strong> {meta.orbit_type}
                                <br />
                                <strong>Высота орбиты:</strong> ~{meta.approx_altitude_km} км
                                <br />
                                <strong>Период обращения:</strong> {meta.period_minutes} мин
                                <br />
                                <strong>Текущие координаты:</strong>
                                <br />
                                Lat: {pos.geodetic.lat.toFixed(4)}°, Lon: {pos.geodetic.lon.toFixed(4)}°
                                <br />
                                {pos.velocity && (
                                    <>
                                        <strong>Скорость (Vx, Vy):</strong> {pos.velocity.vx?.toFixed(4) || 'N/A'},{' '}
                                        {pos.velocity.vy?.toFixed(4) || 'N/A'}
                                        <br />
                                        <strong>Курс (расчётный):</strong> {bearing.toFixed(2)}°
                                        <br />
                                    </>
                                )}
                                <strong>Время:</strong> {new Date(pos.timestamp).toLocaleString()}
                            </Popup>
                        </Marker>
                    );
                })}

                {workingPolygonPositions.length > 2 ? (
                    <Polygon
                        positions={workingPolygonPositions}
                        pathOptions={{
                            color: '#a855f7',
                            fillColor: '#a855f7',
                            fillOpacity: 0.14,
                            weight: 2,
                            dashArray: '6, 6',
                        }}
                    />
                ) : (
                    coverageFootprint?.center?.lat && coverageFootprint?.radius_km ? (
                        <Circle
                            center={[coverageFootprint.center.lat, coverageFootprint.center.lon]}
                            radius={coverageFootprint.radius_km * 1000}
                            pathOptions={{
                                color: '#a855f7',
                                fillColor: '#a855f7',
                                fillOpacity: 0.14,
                                weight: 2,
                                dashArray: '6, 6',
                            }}
                        />
                    ) : null
                )}

                {visibilityPolygonPositions.length > 2 ? (
                    <Polygon
                        positions={visibilityPolygonPositions}
                        pathOptions={{
                            color: '#22c55e',
                            fillColor: '#22c55e',
                            fillOpacity: 0.04,
                            weight: 2,
                            dashArray: '5, 5',
                        }}
                    />
                ) : (
                    visibilityFootprint?.center?.lat && visibilityFootprint?.radius_km ? (
                        <Circle
                            center={[visibilityFootprint.center.lat, visibilityFootprint.center.lon]}
                            radius={visibilityFootprint.radius_km * 1000}
                            pathOptions={{
                                color: '#22c55e',
                                fillColor: 'transparent',
                                fillOpacity: 0,
                                weight: 2,
                                dashArray: '5, 5',
                            }}
                        />
                    ) : null
                )}
            </MapContainer>
        </div>
    );
};

export default SatelliteTracker;
