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
    useMap,
    useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Sidebar from './Sidebar';
import { getSatelliteCoverage, getSatellitePositions, getSatellites, getSatelliteTrack, getSatelliteVisibility } from '../api/satellites';
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

const FAST_POINT_RADIUS = 2.4;
const FANCY_POINT_SIZE = 12;
const FANCY_SPRITE_STEPS = 24;
const MAX_SPEED_REQUEST_RATE_MS = 800;

const MapClickHandler = ({ onMapClick }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng);
        },
    });
    return null;
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

const quantizeAngleIndex = (angle) => {
    const normalized = ((angle % 360) + 360) % 360;
    return Math.round((normalized / 360) * FANCY_SPRITE_STEPS) % FANCY_SPRITE_STEPS;
};

const createFancySprites = (image, size) => {
    return Array.from({ length: FANCY_SPRITE_STEPS }, (_, index) => {
        const sprite = document.createElement('canvas');
        sprite.width = size;
        sprite.height = size;
        const ctx = sprite.getContext('2d');
        if (!ctx) return sprite;

        ctx.translate(size / 2, size / 2);
        ctx.rotate((index * 2 * Math.PI) / FANCY_SPRITE_STEPS);
        ctx.drawImage(image, -size / 2, -size / 2, size, size);
        return sprite;
    });
};

const segmentTrajectory = (points) => {
    if (!Array.isArray(points) || points.length < 2) return [];

    const segments = [];
    let currentSegment = [];

    points.forEach((point) => {
        if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;

        if (currentSegment.length === 0) {
            currentSegment.push([point.lat, point.lon]);
            return;
        }

        const prev = currentSegment[currentSegment.length - 1];
        const lonJump = Math.abs(point.lon - prev[1]);
        if (lonJump > 180) {
            if (currentSegment.length > 1) {
                segments.push(currentSegment);
            }
            currentSegment = [[point.lat, point.lon]];
            return;
        }

        currentSegment.push([point.lat, point.lon]);
    });

    if (currentSegment.length > 1) {
        segments.push(currentSegment);
    }

    return segments;
};

const buildPositionFilters = (filters) => ({
    country: filters.country || undefined,
    orbit_type: filters.orbitType || undefined,
    purpose: filters.purpose || undefined,
});

const SatelliteCanvasLayer = ({ satellites, selectedSatelliteId, onSatelliteClick, fancyMode }) => {
    const map = useMap();
    const canvasRef = useRef(null);
    const spriteCacheRef = useRef([]);
    const imageReadyRef = useRef(false);
    const hitTargetsRef = useRef([]);
    const redrawRef = useRef(() => {});

    useEffect(() => {
        let disposed = false;
        const image = new Image();
        image.src = '/satelite.png';
        image.onload = () => {
            if (disposed) return;
            spriteCacheRef.current = createFancySprites(image, FANCY_POINT_SIZE);
            imageReadyRef.current = true;
            redrawRef.current?.();
        };
        image.onerror = () => {
            imageReadyRef.current = false;
            spriteCacheRef.current = [];
            redrawRef.current?.();
        };
        return () => {
            disposed = true;
        };
    }, []);

    useEffect(() => {
        const canvas = L.DomUtil.create('canvas', 'satellite-canvas-layer');
        canvas.style.position = 'absolute';
        canvas.style.pointerEvents = 'auto';
        canvas.style.zIndex = '450';
        canvasRef.current = canvas;
        map.getPanes().overlayPane.appendChild(canvas);

        const resizeCanvas = () => {
            const size = map.getSize();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.floor(size.x * dpr));
            canvas.height = Math.max(1, Math.floor(size.y * dpr));
            canvas.style.width = `${size.x}px`;
            canvas.style.height = `${size.y}px`;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
        };

        const redraw = () => {
            if (!canvasRef.current) return;
            resizeCanvas();

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const size = map.getSize();
            const topLeft = map.containerPointToLayerPoint([0, 0]);
            L.DomUtil.setPosition(canvas, topLeft);
            ctx.clearRect(0, 0, size.x, size.y);

            const nextHitTargets = [];

            satellites.forEach((satellite) => {
                const geodetic = satellite?.geodetic;
                if (!geodetic || !Number.isFinite(geodetic.lat) || !Number.isFinite(geodetic.lon)) {
                    return;
                }

                const point = map.latLngToLayerPoint([geodetic.lat, geodetic.lon]).subtract(topLeft);
                if (point.x < -20 || point.y < -20 || point.x > size.x + 20 || point.y > size.y + 20) {
                    return;
                }

                const isSelected = satellite.satellite_id === selectedSatelliteId;
                const radius = fancyMode ? FANCY_POINT_SIZE / 2 : FAST_POINT_RADIUS + (isSelected ? 1.5 : 0);

                if (fancyMode && imageReadyRef.current && spriteCacheRef.current.length) {
                    const sprite = spriteCacheRef.current[quantizeAngleIndex(calculateBearingFromVelocity(satellite))];
                    if (sprite) {
                        ctx.save();
                        if (isSelected) {
                            ctx.beginPath();
                            ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(255, 196, 61, 0.22)';
                            ctx.fill();
                        }
                        ctx.drawImage(sprite, point.x - FANCY_POINT_SIZE / 2, point.y - FANCY_POINT_SIZE / 2, FANCY_POINT_SIZE, FANCY_POINT_SIZE);
                        ctx.restore();
                    }
                } else {
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = isSelected ? '#f59e0b' : '#2563eb';
                    ctx.fill();
                    if (isSelected) {
                        ctx.lineWidth = 1.5;
                        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
                        ctx.stroke();
                    }
                }

                nextHitTargets.push({
                    satelliteId: satellite.satellite_id,
                    x: point.x,
                    y: point.y,
                    radius: Math.max(radius + 2, 6),
                });
            });

            hitTargetsRef.current = nextHitTargets;
        };

        redrawRef.current = () => window.requestAnimationFrame(redraw);
        redraw();

        const handleMapRedraw = () => redrawRef.current();
        const handleClick = (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            let matchedId = null;
            let bestDistance = Number.POSITIVE_INFINITY;

            for (let index = hitTargetsRef.current.length - 1; index >= 0; index -= 1) {
                const target = hitTargetsRef.current[index];
                const distance = Math.hypot(target.x - x, target.y - y);
                if (distance <= target.radius && distance < bestDistance) {
                    matchedId = target.satelliteId;
                    bestDistance = distance;
                }
            }

            if (matchedId != null) {
                L.DomEvent.stop(event);
                onSatelliteClick(matchedId);
            }
        };

        map.on('move zoom zoomend resize viewreset', handleMapRedraw);
        canvas.addEventListener('click', handleClick);

        return () => {
            canvas.removeEventListener('click', handleClick);
            map.off('move zoom zoomend resize viewreset', handleMapRedraw);
            if (canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
            canvasRef.current = null;
        };
    }, [map, onSatelliteClick, satellites, selectedSatelliteId, fancyMode]);

    useEffect(() => {
        redrawRef.current?.();
    }, [satellites, selectedSatelliteId, fancyMode]);

    return null;
};

const SatelliteTracker = ({ fancyMode = false, onFancyModeChange = () => {} }) => {
    const [satellitesPosition, setSatellitesPosition] = useState([]);
    const [satelliteMetadata, setSatelliteMetadata] = useState({});
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
    const isFetchingPositionsRef = useRef(false);

    const selectedSatellitePosition = useMemo(
        () => satellitesPosition.find((sat) => sat.satellite_id === selectedSatelliteId) || null,
        [satellitesPosition, selectedSatelliteId]
    );

    const selectedSatelliteName = useMemo(() => {
        if (!selectedSatelliteId) return '';
        return satelliteMetadata[selectedSatelliteId]?.name || selectedSatellitePosition?.satellite_name || `Спутник ${selectedSatelliteId}`;
    }, [satelliteMetadata, selectedSatelliteId, selectedSatellitePosition]);

    const selectedSatelliteInfo = useMemo(() => {
        if (!selectedSatellitePosition) return null;
        const meta = satelliteMetadata[selectedSatellitePosition.satellite_id];
        const bearing = calculateBearingFromVelocity(selectedSatellitePosition);
        return {
            name: meta?.name || selectedSatellitePosition.satellite_name || `Спутник ${selectedSatellitePosition.satellite_id}`,
            country: meta?.country || selectedSatellitePosition.country || 'Unknown',
            operator: meta?.operator || selectedSatellitePosition.operator || 'Unknown',
            orbit_type: meta?.orbit_type || selectedSatellitePosition.orbit_type || 'Unknown',
            approx_altitude_km: meta?.approx_altitude_km ?? selectedSatellitePosition.geodetic?.alt_km ?? null,
            period_minutes: meta?.period_minutes ?? selectedSatellitePosition.period_minutes ?? null,
            bearing,
        };
    }, [satelliteMetadata, selectedSatellitePosition]);

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

    const segmentedTrajectory = useMemo(() => segmentTrajectory(currentTrajectory), [currentTrajectory]);

    const filteredSatellites = useMemo(() => {
        let filtered = satellitesPosition;

        if (filters.country) {
            filtered = filtered.filter((pos) => {
                const meta = satelliteMetadata[pos.satellite_id];
                return (meta?.country || pos.country) === filters.country;
            });
        }
        if (filters.orbitType) {
            filtered = filtered.filter((pos) => {
                const meta = satelliteMetadata[pos.satellite_id];
                return (meta?.orbit_type || pos.orbit_type) === filters.orbitType;
            });
        }
        if (filters.purpose) {
            filtered = filtered.filter((pos) => {
                const meta = satelliteMetadata[pos.satellite_id];
                return (meta?.purpose || pos.purpose) === filters.purpose;
            });
        }

        return filtered.filter((pos) => pos?.geodetic && Number.isFinite(pos.geodetic.lat) && Number.isFinite(pos.geodetic.lon));
    }, [filters, satellitesPosition, satelliteMetadata]);

    const fetchMetadata = async () => {
        try {
            const metaMap = {};
            const pageSize = 500;
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                const data = await getSatellites({ limit: pageSize, offset });
                const items = Array.isArray(data?.items) ? data.items : [];

                items.forEach((item) => {
                    metaMap[item.id] = item;
                });

                hasMore = items.length === pageSize;
                offset += pageSize;
            }

            setSatelliteMetadata(metaMap);
        } catch (err) {
            console.error('Ошибка загрузки метаданных:', err);
        }
    };

    const fetchPositions = useCallback(async () => {
        if (isFetchingPositionsRef.current) return;
        isFetchingPositionsRef.current = true;
        try {
            const data = await getSatellitePositions(buildPositionFilters(filters));
            setSatellitesPosition(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Ошибка загрузки позиций:', err);
        } finally {
            isFetchingPositionsRef.current = false;
        }
    }, [filters]);

    const getCountryByCoordinates = async (lat, lon) => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3&addressdetails=1`
            );
            const data = await response.json();
            const address = data.address;
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

            const data = await getSatelliteCoverage(satelliteId, {
                timestamp: currentSat.timestamp,
            });

            setCoverageFootprint(data);
        } catch (err) {
            console.error('Ошибка загрузки зоны покрытия:', err);
            setCoverageFootprint(null);
        }
    }, [satellitesPosition]);

    const fetchTrajectory = useCallback(async (satelliteId) => {
        const currentSat = satellitesPosition.find((sat) => sat.satellite_id === satelliteId);
        const centerTime = currentSat?.timestamp ? new Date(currentSat.timestamp) : new Date();
        const startTime = new Date(centerTime.getTime() - 2 * 60 * 60 * 1000);
        const endTime = new Date(centerTime.getTime() + 2 * 60 * 60 * 1000);

        try {
            const response = await getSatelliteTrack(satelliteId, {
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                step_seconds: 60,
            });

            const trajectoryData = response?.points;

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
    }, [satellitesPosition]);

    const fetchVisibility = useCallback(async (satelliteId) => {
        try {
            const currentSat = satellitesPosition.find((sat) => sat.satellite_id === satelliteId);
            const data = await getSatelliteVisibility(satelliteId, {
                timestamp: currentSat?.timestamp,
            });
            setVisibilityFootprint(data);
        } catch (err) {
            console.error('Ошибка загрузки зоны радиовидимости:', err);
            setVisibilityFootprint(null);
        }
    }, [satellitesPosition]);

    useEffect(() => {
        fetchMetadata();
        fetchSubscriptions();
    }, []);

    useEffect(() => {
        fetchPositions();
    }, [fetchPositions]);

    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        const intervalTime = Math.max(MAX_SPEED_REQUEST_RATE_MS, Math.floor(5000 / Math.max(speed, 1)));
        intervalRef.current = setInterval(fetchPositions, intervalTime);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [fetchPositions, speed]);

    useEffect(() => {
        if (!selectedSatelliteId) return;

        const currentSatellite = satellitesPosition.find((sat) => sat.satellite_id === selectedSatelliteId);
        if (currentSatellite) {
            fetchCoverage(selectedSatelliteId);
            fetchVisibility(selectedSatelliteId);
        }
    }, [fetchCoverage, fetchVisibility, satellitesPosition, selectedSatelliteId]);

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
    }, [fetchTrajectory, selectedSatelliteId]);

    useEffect(() => {
        if (!selectedSatelliteId) return;
        const stillVisible = filteredSatellites.some((sat) => sat.satellite_id === selectedSatelliteId);
        if (!stillVisible) {
            setSelectedSatelliteId(null);
            setCurrentTrajectory([]);
            setCoverageFootprint(null);
            setVisibilityFootprint(null);
        }
    }, [filteredSatellites, selectedSatelliteId]);

    const satellitesForSidebar = useMemo(() => {
        const byId = new Map();

        satellitesPosition.forEach((pos) => {
            const meta = satelliteMetadata[pos.satellite_id];
            byId.set(pos.satellite_id, {
                id: pos.satellite_id,
                name: meta?.name || pos.satellite_name || `Спутник ${pos.satellite_id}`,
                country: meta?.country || pos.country || 'Unknown',
                operator: meta?.operator || pos.operator || 'Unknown',
                orbit_type: meta?.orbit_type || pos.orbit_type || 'Unknown',
                purpose: meta?.purpose || pos.purpose || 'Unknown',
                approx_altitude_km: meta?.approx_altitude_km ?? pos.geodetic?.alt_km ?? null,
                period_minutes: meta?.period_minutes ?? pos.period_minutes ?? null,
            });
        });

        return Array.from(byId.values());
    }, [satelliteMetadata, satellitesPosition]);

    const handleSatelliteClick = useCallback((satelliteId) => {
        if (selectedSatelliteId === satelliteId) {
            setSelectedSatelliteId(null);
            setVisibilityFootprint(null);
            setCoverageFootprint(null);
        } else {
            setSelectedSatelliteId(satelliteId);
            fetchCoverage(satelliteId);
            fetchVisibility(satelliteId);
        }
    }, [fetchCoverage, fetchVisibility, selectedSatelliteId]);

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
                fancyMode={fancyMode}
                onFancyModeChange={onFancyModeChange}
            />

            <MapContainer center={[0, 0]} zoom={2} zoomControl={false} preferCanvas style={{ height: '100vh', width: '100%' }}>
                <ZoomControl position="bottomleft" />
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <SatelliteCanvasLayer
                    satellites={filteredSatellites}
                    selectedSatelliteId={selectedSatelliteId}
                    onSatelliteClick={handleSatelliteClick}
                    fancyMode={fancyMode}
                />

                <MapClickHandler onMapClick={handleMapClick} />

                {segmentedTrajectory.length > 0 && selectedSatelliteId && (
                    <Polyline
                        positions={segmentedTrajectory}
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

                {selectedSatellitePosition && selectedSatelliteInfo && (
                    <Popup
                        position={[selectedSatellitePosition.geodetic.lat, selectedSatellitePosition.geodetic.lon]}
                        key={`${selectedSatellitePosition.satellite_id}-${selectedSatellitePosition.timestamp}`}
                    >
                        <h3>{selectedSatelliteInfo.name}</h3>
                        <strong>Страна/Оператор:</strong> {selectedSatelliteInfo.country} / {selectedSatelliteInfo.operator}
                        <br />
                        <strong>Тип орбиты:</strong> {selectedSatelliteInfo.orbit_type}
                        <br />
                        <strong>Высота орбиты:</strong>{' '}
                        {selectedSatelliteInfo.approx_altitude_km != null ? `~${Number(selectedSatelliteInfo.approx_altitude_km).toFixed(0)} км` : 'N/A'}
                        <br />
                        <strong>Период обращения:</strong> {selectedSatelliteInfo.period_minutes != null ? `${selectedSatelliteInfo.period_minutes} мин` : 'N/A'}
                        <br />
                        <strong>Текущие координаты:</strong>
                        <br />
                        Lat: {selectedSatellitePosition.geodetic.lat.toFixed(4)}°, Lon: {selectedSatellitePosition.geodetic.lon.toFixed(4)}°
                        <br />
                        {selectedSatellitePosition.velocity && (
                            <>
                                <strong>Скорость (Vx, Vy):</strong> {selectedSatellitePosition.velocity.vx?.toFixed(4) || 'N/A'},{' '}
                                {selectedSatellitePosition.velocity.vy?.toFixed(4) || 'N/A'}
                                <br />
                                <strong>Курс (расчётный):</strong> {selectedSatelliteInfo.bearing.toFixed(2)}°
                                <br />
                            </>
                        )}
                        <strong>Время:</strong> {new Date(selectedSatellitePosition.timestamp).toLocaleString()}
                    </Popup>
                )}

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
