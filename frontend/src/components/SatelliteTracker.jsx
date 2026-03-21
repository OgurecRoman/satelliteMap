import React, {useState, useEffect} from 'react';
import {MapContainer, TileLayer, Marker, Popup} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';

const satelliteIcon = L.icon({
    iconUrl: '/satelite.png',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
});

const SatelliteTracker = () => {
  const [satellitesPosition, setSatellitesPosition] = useState([]);
  const [satelliteMetadata, setSatelliteMetadata] = useState({}); // id → metadata

  // Загрузка метаданных спутников
  const fetchMetadata = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/v1/satellites');
      const metaMap = {};
      res.data.items.forEach(item => {
        metaMap[item.id] = item; // используем id как ключ
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

  // Инициализация
  useEffect(() => {
    fetchMetadata();
    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => clearInterval(interval);
  }, []);

  // Функция получения метаданных по satellite_id
  const getSatelliteInfo = (satId) => {
    return satelliteMetadata[satId] || null;
  };

  return (
    <MapContainer center={[0, 0]} zoom={2} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {satellitesPosition.map((pos) => {
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
              <strong>Высота
                орбиты:</strong> ~{meta.approx_altitude_km} км<br/>
              <strong>Период обращения:</strong> {meta.period_minutes} мин<br/>
              <strong>Текущие координаты:</strong><br/>
              Lat: {pos.geodetic.lat.toFixed(4)}°,
              Lon: {pos.geodetic.lon.toFixed(4)}°<br/>
              <strong>Время:</strong> {new Date(pos.timestamp).toLocaleString()}
              {/* Пока без "времени следующего пролёта" */}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default SatelliteTracker;