import React, {useState, useEffect} from 'react';
import {MapContainer, TileLayer, Marker, Popup} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';

const satelliteIcon = L.icon({
    iconUrl: '/satelite.png',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
});

const SatelliteTracker = () => {
    const [satellites, setSatellites] = useState([]);

    // Загрузка данных о спутниках
    const fetchSatellites = async () => {
        try {
            const response = await axios.get('http://127.0.0.1:8000/api/v1/satellites/positions');
            setSatellites(response.data);
        } catch (error) {
            console.error('Ошибка при загрузке позиций спутников:', error);
        }
    };

    useEffect(() => {
        fetchSatellites(); // Сначала загружаем сразу
        const interval = setInterval(fetchSatellites, 2000); // Повтор каждые 2 секунды

        return () => clearInterval(interval);
    }, []);

    return (
        <MapContainer center={[0, 0]} zoom={2}
                      style={{height: '100vh', width: '100%'}}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {satellites.map((sat) => (
                <Marker
                    key={sat.satellite_id}
                    position={[sat.geodetic.lat, sat.geodetic.lon]}
                    icon={satelliteIcon}>
                    <Popup>
                        <b>{sat.satellite_name}</b><br/>
                        ID: {sat.satellite_id}<br/>
                        Время: {sat.timestamp}
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default SatelliteTracker;