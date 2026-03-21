import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { EARTH_RADIUS_UNITS, latLonAltToVector3, vector3ToLatLon } from '../utils/coordinates';
import worldData from '../assets/world-lowres.json';

const CONTINENT_COLORS = {
  Africa: '#5fa85c',
  Antarctica: '#dbeafe',
  Asia: '#7bb26d',
  Europe: '#82b66f',
  'North America': '#739f63',
  Oceania: '#88b87b',
  'Seven seas (open ocean)': '#5b90d6',
  'South America': '#6ea964',
};

function projectLonLatToTexture(lon, lat, width, height) {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

function createEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 2048;
  const context = canvas.getContext('2d');

  const oceanGradient = context.createLinearGradient(0, 0, 0, canvas.height);
  oceanGradient.addColorStop(0, '#184b7a');
  oceanGradient.addColorStop(0.45, '#11385d');
  oceanGradient.addColorStop(1, '#0a213b');
  context.fillStyle = oceanGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(255,255,255,0.08)';
  context.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = projectLonLatToTexture(lon, 0, canvas.width, canvas.height);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = projectLonLatToTexture(0, lat, canvas.width, canvas.height);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  worldData.countries.forEach((country) => {
    context.fillStyle = CONTINENT_COLORS[country.continent] || '#78ae67';
    context.strokeStyle = 'rgba(222, 239, 255, 0.28)';
    context.lineWidth = 0.9;
    country.polygons.forEach((polygon) => {
      context.beginPath();
      polygon.forEach((ring, ringIndex) => {
        ring.forEach(([lon, lat], pointIndex) => {
          const [x, y] = projectLonLatToTexture(lon, lat, canvas.width, canvas.height);
          if (pointIndex === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.closePath();
        if (ringIndex === 0) context.fill();
      });
      context.stroke();
    });
  });

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = canvas.width;
  cloudCanvas.height = canvas.height;
  const cloudContext = cloudCanvas.getContext('2d');
  for (let i = 0; i < 180; i += 1) {
    cloudContext.fillStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.03})`;
    cloudContext.beginPath();
    cloudContext.ellipse(Math.random() * cloudCanvas.width, Math.random() * cloudCanvas.height, 24 + Math.random() * 120, 10 + Math.random() * 34, Math.random() * Math.PI, 0, Math.PI * 2);
    cloudContext.fill();
  }
  context.drawImage(cloudCanvas, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function Earth({ onSelectPoint, selectedPoint }) {
  const earthTexture = useMemo(() => createEarthTexture(), []);
  const pointerDownRef = useRef(null);
  useEffect(() => () => { earthTexture.dispose(); }, [earthTexture]);
  return (
    <group>
      <mesh rotation={[0, -Math.PI / 2, 0]} onContextMenu={(event) => event.stopPropagation()} onPointerDown={(event) => { pointerDownRef.current = { button: event.button, x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => { const pointerDown = pointerDownRef.current; pointerDownRef.current = null; if (!pointerDown || pointerDown.button !== 0 || event.button !== 0) return; const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y); if (distance > 6) return; event.stopPropagation(); onSelectPoint(vector3ToLatLon(event.point)); }}>
        <sphereGeometry args={[EARTH_RADIUS_UNITS, 128, 128]} />
        <meshStandardMaterial map={earthTexture} roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh scale={1.02}><sphereGeometry args={[EARTH_RADIUS_UNITS, 64, 64]} /><meshBasicMaterial color="#60a5fa" transparent opacity={0.08} side={THREE.BackSide} /></mesh>
      {selectedPoint ? (<mesh position={latLonAltToVector3(selectedPoint.lat, selectedPoint.lon, 30)}><sphereGeometry args={[0.04, 12, 12]} /><meshBasicMaterial color="#f59e0b" /><Html distanceFactor={8} position={[0.08, 0.08, 0]}><div className="globe-label">Выбранная точка</div></Html></mesh>) : null}
    </group>
  );
}

function CountryBorders() {
  const rings = useMemo(() => worldData.countries.flatMap((country) => country.polygons.map((polygon, index) => ({ key: `${country.name}-${index}`, points: polygon[0].map(([lon, lat]) => { const vector = latLonAltToVector3(lat, lon, 2); return [vector.x, vector.y, vector.z]; }) }))), []);
  return <group>{rings.map((ring) => <Line key={ring.key} points={ring.points} color="#dbe8f3" lineWidth={0.7} transparent opacity={0.62} closed />)}</group>;
}

function ContinentLabels() {
  return <group>{worldData.continentLabels.map((item) => { const position = latLonAltToVector3(item.lat, item.lon, 60); return <group key={item.name} position={position}><Html distanceFactor={11} center><div className="globe-label globe-label-subtle">{translateContinentName(item.name)}</div></Html></group>; })}</group>;
}

function SatelliteCloud({ satellites, selectedSatelliteId, onSelectSatellite }) {
  const meshRef = useRef();
  const helper = useMemo(() => new THREE.Object3D(), []);
  const defaultColor = useMemo(() => new THREE.Color('#7dd3fc'), []);
  const selectedColor = useMemo(() => new THREE.Color('#f59e0b'), []);
  useEffect(() => {
    if (!meshRef.current) return;
    satellites.forEach((satellite, index) => {
      const position = latLonAltToVector3(satellite.geodetic.lat, satellite.geodetic.lon, satellite.geodetic.alt_km);
      helper.position.copy(position);
      const scale = satellite.satellite_id === selectedSatelliteId ? 1.8 : 1;
      helper.scale.setScalar(scale);
      helper.updateMatrix();
      meshRef.current.setMatrixAt(index, helper.matrix);
      meshRef.current.setColorAt(index, satellite.satellite_id === selectedSatelliteId ? selectedColor : defaultColor);
    });
    meshRef.current.count = satellites.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [defaultColor, helper, satellites, selectedColor, selectedSatelliteId]);
  return <instancedMesh ref={meshRef} args={[null, null, Math.max(satellites.length, 1)]} onClick={(event) => { event.stopPropagation(); const clicked = satellites[event.instanceId]; if (clicked) onSelectSatellite(clicked.satellite_id); }}><sphereGeometry args={[0.04, 14, 14]} /><meshStandardMaterial vertexColors emissive="#164e63" emissiveIntensity={0.45} /></instancedMesh>;
}

function SelectedSatelliteLabel({ satellite }) {
  if (!satellite?.geodetic) return null;
  const position = latLonAltToVector3(satellite.geodetic.lat, satellite.geodetic.lon, satellite.geodetic.alt_km + 140);
  return <group position={position}><mesh><sphereGeometry args={[0.055, 16, 16]} /><meshBasicMaterial color="#f59e0b" /></mesh><Html distanceFactor={6} position={[0.12, 0.12, 0]}><div className="globe-label emphasized">{satellite.meta?.name || satellite.satellite_name}</div></Html></group>;
}

function TrackLine({ track }) { if (!track?.points?.length) return null; const positions = track.points.map((point) => { const vector = latLonAltToVector3(point.geodetic.lat, point.geodetic.lon, point.geodetic.alt_km); return [vector.x, vector.y, vector.z]; }); return <Line points={positions} color="#f97316" lineWidth={1.6} />; }
function FootprintLine({ footprint, altitude = 20, color }) { const coordinates = footprint?.polygon?.coordinates?.[0]; if (!coordinates?.length) return null; const points = coordinates.map(([lon, lat]) => { const vector = latLonAltToVector3(lat, lon, altitude); return [vector.x, vector.y, vector.z]; }); return <Line points={points} color={color} lineWidth={1.1} closed />; }
function SceneContent({ satellites, selectedSatellite, selectedSatelliteId, onSelectSatellite, onSelectPoint, selectedPoint, track, visibilityFootprint, coverageFootprint }) { return <><ambientLight intensity={0.68} /><directionalLight position={[6, 3, 8]} intensity={2.25} /><pointLight position={[-10, -3, -8]} intensity={0.5} color="#60a5fa" /><Stars radius={120} depth={60} count={5000} factor={5} saturation={0} fade speed={1} /><Earth onSelectPoint={onSelectPoint} selectedPoint={selectedPoint} /><CountryBorders /><ContinentLabels /><SatelliteCloud satellites={satellites} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={onSelectSatellite} /><SelectedSatelliteLabel satellite={selectedSatellite} /><TrackLine track={track} /><FootprintLine footprint={visibilityFootprint} altitude={12} color="#34d399" /><FootprintLine footprint={coverageFootprint} altitude={16} color="#a855f7" /><OrbitControls enablePan enableZoom enableRotate minDistance={3.2} maxDistance={14} /></>; }
function translateContinentName(name) { const labels = { Africa: 'Африка', Antarctica: 'Антарктида', Asia: 'Азия', Europe: 'Европа', 'North America': 'Северная Америка', Oceania: 'Океания', 'South America': 'Южная Америка' }; return labels[name] || name; }
export default function Earth3D({ satellites, selectedSatelliteId, onSelectSatellite, onSelectPoint, selectedPoint, track, visibilityFootprint, coverageFootprint }) { const selectedSatellite = useMemo(() => satellites.find((item) => item.satellite_id === selectedSatelliteId) || null, [satellites, selectedSatelliteId]); return <div className="globe-canvas-shell"><Canvas camera={{ position: [0, 4.6, 6.5], fov: 48 }} gl={{ antialias: true }}><SceneContent satellites={satellites} selectedSatellite={selectedSatellite} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={onSelectSatellite} onSelectPoint={onSelectPoint} selectedPoint={selectedPoint} track={track} visibilityFootprint={visibilityFootprint} coverageFootprint={coverageFootprint} /></Canvas></div>; }
