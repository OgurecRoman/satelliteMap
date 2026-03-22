import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const DEFAULT_COLOR = '#7dd3fc';
const SELECTED_COLOR = '#f59e0b';
const OUTLINE_COLOR = 'rgba(8, 18, 31, 0.78)';
const HIT_RADIUS_PX = 10;
const OFFSCREEN_MARGIN_PX = 24;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildPopupHtml(pos, displayMeta) {
    const lat = Number.isFinite(pos?.geodetic?.lat) ? `${pos.geodetic.lat.toFixed(4)}°` : 'N/A';
    const lon = Number.isFinite(pos?.geodetic?.lon) ? `${pos.geodetic.lon.toFixed(4)}°` : 'N/A';
    const altitude = Number.isFinite(displayMeta?.approx_altitude_km)
        ? `~${Number(displayMeta.approx_altitude_km).toFixed(0)} км`
        : 'N/A';
    const period = Number.isFinite(displayMeta?.period_minutes)
        ? `${Number(displayMeta.period_minutes).toFixed(1)} мин`
        : 'N/A';
    const timestamp = pos?.timestamp ? new Date(pos.timestamp).toLocaleString() : 'N/A';
    const vx = Number.isFinite(pos?.velocity?.vx) ? pos.velocity.vx.toFixed(4) : 'N/A';
    const vy = Number.isFinite(pos?.velocity?.vy) ? pos.velocity.vy.toFixed(4) : 'N/A';

    return `
        <div class="satellite-popup-content">
            <h3 style="margin:0 0 8px 0; font-size:16px; line-height:1.3;">${escapeHtml(displayMeta.name)}</h3>
            <div><strong>Страна/Оператор:</strong> ${escapeHtml(displayMeta.country)} / ${escapeHtml(displayMeta.operator)}</div>
            <div><strong>Тип орбиты:</strong> ${escapeHtml(displayMeta.orbit_type)}</div>
            <div><strong>Высота орбиты:</strong> ${altitude}</div>
            <div><strong>Период обращения:</strong> ${period}</div>
            <div><strong>Текущие координаты:</strong><br />Lat: ${lat}, Lon: ${lon}</div>
            <div><strong>Скорость (Vx, Vy):</strong> ${vx}, ${vy}</div>
            <div><strong>Время:</strong> ${escapeHtml(timestamp)}</div>
        </div>
    `;
}

function getDisplayMeta(pos, metadata) {
    const meta = metadata?.[pos.satellite_id];
    return {
        name: meta?.name || pos.satellite_name || `Спутник ${pos.satellite_id}`,
        country: meta?.country || pos.country || 'Unknown',
        operator: meta?.operator || pos.operator || 'Unknown',
        orbit_type: meta?.orbit_type || pos.orbit_type || 'Unknown',
        approx_altitude_km: meta?.approx_altitude_km ?? pos.geodetic?.alt_km ?? null,
        period_minutes: meta?.period_minutes ?? pos.period_minutes ?? null,
    };
}

function drawSatellite(ctx, x, y, radius, selected) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
    ctx.fillStyle = OUTLINE_COLOR;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = selected ? SELECTED_COLOR : DEFAULT_COLOR;
    ctx.fill();

    if (selected) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function SatelliteCanvasOverlay({
    satellites,
    satelliteMetadata,
    selectedSatelliteId,
    onSatelliteClick,
}) {
    const map = useMap();
    const canvasRef = useRef(null);
    const popupRef = useRef(null);
    const hitPointsRef = useRef([]);
    const rafRef = useRef(null);

    const visibleSatellites = useMemo(
        () => satellites.filter((pos) => Number.isFinite(pos?.geodetic?.lat) && Number.isFinite(pos?.geodetic?.lon)),
        [satellites]
    );

    const syncCanvasSize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const size = map.getSize();
        const pixelRatio = window.devicePixelRatio || 1;
        const targetWidth = Math.max(1, Math.round(size.x * pixelRatio));
        const targetHeight = Math.max(1, Math.round(size.y * pixelRatio));

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
        }

        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;

        const context = canvas.getContext('2d');
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }, [map]);

    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        syncCanvasSize();
        const context = canvas.getContext('2d');
        const size = map.getSize();
        const zoom = map.getZoom();
        const radius = zoom >= 8 ? 4.8 : zoom >= 6 ? 4 : zoom >= 4 ? 3.5 : 3;

        context.clearRect(0, 0, size.x, size.y);

        const nextHitPoints = [];
        for (let index = 0; index < visibleSatellites.length; index += 1) {
            const pos = visibleSatellites[index];
            const point = map.latLngToContainerPoint([pos.geodetic.lat, pos.geodetic.lon]);
            if (
                point.x < -OFFSCREEN_MARGIN_PX || point.x > size.x + OFFSCREEN_MARGIN_PX
                || point.y < -OFFSCREEN_MARGIN_PX || point.y > size.y + OFFSCREEN_MARGIN_PX
            ) {
                continue;
            }

            const selected = pos.satellite_id === selectedSatelliteId;
            drawSatellite(context, point.x, point.y, radius, selected);
            nextHitPoints.push({
                x: point.x,
                y: point.y,
                radius,
                pos,
                displayMeta: getDisplayMeta(pos, satelliteMetadata),
            });
        }

        hitPointsRef.current = nextHitPoints;

        if (selectedSatelliteId && popupRef.current?.isOpen()) {
            const selectedHitPoint = nextHitPoints.find((item) => item.pos.satellite_id === selectedSatelliteId);
            if (selectedHitPoint) {
                popupRef.current
                    .setLatLng([selectedHitPoint.pos.geodetic.lat, selectedHitPoint.pos.geodetic.lon])
                    .setContent(buildPopupHtml(selectedHitPoint.pos, selectedHitPoint.displayMeta));
            }
        }
    }, [map, satelliteMetadata, selectedSatelliteId, syncCanvasSize, visibleSatellites]);

    const scheduleRedraw = useCallback(() => {
        if (rafRef.current) {
            window.cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            redraw();
        });
    }, [redraw]);

    useEffect(() => {
        const canvas = document.createElement('canvas');
        canvas.className = 'leaflet-zoom-animated satellite-canvas-overlay';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '450';
        canvas.style.pointerEvents = 'auto';

        const overlayPane = map.getPanes().overlayPane;
        overlayPane.appendChild(canvas);
        canvasRef.current = canvas;

        const findClosestSatellite = (containerX, containerY) => {
            let closestPoint = null;
            let closestDistanceSq = Number.POSITIVE_INFINITY;

            for (let index = 0; index < hitPointsRef.current.length; index += 1) {
                const hitPoint = hitPointsRef.current[index];
                const dx = hitPoint.x - containerX;
                const dy = hitPoint.y - containerY;
                const distanceSq = dx * dx + dy * dy;
                const maxDistance = Math.max(HIT_RADIUS_PX, hitPoint.radius + 5);
                if (distanceSq <= maxDistance * maxDistance && distanceSq < closestDistanceSq) {
                    closestDistanceSq = distanceSq;
                    closestPoint = hitPoint;
                }
            }

            return closestPoint;
        };

        const handleCanvasClick = (event) => {
            const bounds = canvas.getBoundingClientRect();
            const containerX = event.clientX - bounds.left;
            const containerY = event.clientY - bounds.top;
            const hitPoint = findClosestSatellite(containerX, containerY);

            if (!hitPoint) {
                return;
            }

            L.DomEvent.stop(event);
            const clickedId = hitPoint.pos.satellite_id;
            const willDeselect = clickedId === selectedSatelliteId;
            onSatelliteClick(clickedId);

            if (willDeselect) {
                map.closePopup(popupRef.current);
                return;
            }

            const popup = popupRef.current || L.popup({ offset: [0, -6], autoPan: true, maxWidth: 320 });
            popupRef.current = popup;
            popup
                .setLatLng([hitPoint.pos.geodetic.lat, hitPoint.pos.geodetic.lon])
                .setContent(buildPopupHtml(hitPoint.pos, hitPoint.displayMeta))
                .openOn(map);
        };

        const handleCanvasMouseMove = (event) => {
            const bounds = canvas.getBoundingClientRect();
            const containerX = event.clientX - bounds.left;
            const containerY = event.clientY - bounds.top;
            const hitPoint = findClosestSatellite(containerX, containerY);
            canvas.style.cursor = hitPoint ? 'pointer' : '';
        };

        const handleMapChange = () => scheduleRedraw();

        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        map.on('moveend zoomend resize viewreset', handleMapChange);
        scheduleRedraw();

        return () => {
            canvas.removeEventListener('click', handleCanvasClick);
            canvas.removeEventListener('mousemove', handleCanvasMouseMove);
            map.off('moveend zoomend resize viewreset', handleMapChange);
            if (rafRef.current) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (popupRef.current) {
                map.closePopup(popupRef.current);
            }
            canvas.remove();
            canvasRef.current = null;
        };
    }, [map, onSatelliteClick, scheduleRedraw, selectedSatelliteId]);

    useEffect(() => {
        scheduleRedraw();
    }, [scheduleRedraw, visibleSatellites, selectedSatelliteId, satelliteMetadata]);

    useEffect(() => {
        if (!selectedSatelliteId && popupRef.current) {
            map.closePopup(popupRef.current);
        }
    }, [map, selectedSatelliteId]);

    return null;
}

export default memo(SatelliteCanvasOverlay);
