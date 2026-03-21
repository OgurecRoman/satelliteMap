import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { EARTH_RADIUS_UNITS, latLonAltToVector3, vector3ToLatLon } from '../utils/coordinates';

function createProceduralEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');

  const oceanGradient = context.createLinearGradient(0, 0, 0, canvas.height);
  oceanGradient.addColorStop(0, '#0a2744');
  oceanGradient.addColorStop(0.5, '#0e496f');
  oceanGradient.addColorStop(1, '#08192f');
  context.fillStyle = oceanGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 18; i += 1) {
    context.fillStyle = `rgba(80, 150, 90, ${0.18 + Math.random() * 0.16})`;
    const centerX = Math.random() * canvas.width;
    const centerY = Math.random() * canvas.height;
    const radiusX = 100 + Math.random() * 220;
    const radiusY = 40 + Math.random() * 130;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }

  for (let i = 0; i < 140; i += 1) {
    context.fillStyle = `rgba(255, 255, 255, ${0.02 + Math.random() * 0.035})`;
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const width = 40 + Math.random() * 120;
    const height = 8 + Math.random() * 18;
    context.beginPath();
    context.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }

  for (let i = 0; i < 10; i += 1) {
    context.strokeStyle = `rgba(255,255,255,${0.03 + i * 0.002})`;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, (canvas.height / 10) * i + 20);
    context.lineTo(canvas.width, (canvas.height / 10) * i + 20);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function Earth({ onSelectPoint, selectedPoint }) {
  const earthTexture = useMemo(() => createProceduralEarthTexture(), []);

  useEffect(() => () => { earthTexture.dispose(); }, [earthTexture]);

  return (
    <group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelectPoint(vector3ToLatLon(event.point));
        }}
      >
        <sphereGeometry args={[EARTH_RADIUS_UNITS, 128, 128]} />
        <meshStandardMaterial map={earthTexture} roughness={0.85} metalness={0.05} />
      </mesh>

      <mesh scale={1.02}>
        <sphereGeometry args={[EARTH_RADIUS_UNITS, 64, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>

      {selectedPoint ? (
        <mesh position={latLonAltToVector3(selectedPoint.lat, selectedPoint.lon, 30)}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color="#f59e0b" />
          <Html distanceFactor={8} position={[0.08, 0.08, 0]}>
            <div className="globe-label">Selected point</div>
          </Html>
        </mesh>
      ) : null}
    </group>
  );
}

function SatelliteCloud({ satellites, selectedSatelliteId, onSelectSatellite }) {
  const meshRef = useRef();
  const helper = useMemo(() => new THREE.Object3D(), []);
  const defaultColor = useMemo(() => new THREE.Color('#7dd3fc'), []);
  const selectedColor = useMemo(() => new THREE.Color('#f59e0b'), []);

  useEffect(() => {
    if (!meshRef.current) {
      return;
    }

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
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [defaultColor, helper, satellites, selectedColor, selectedSatelliteId]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, Math.max(satellites.length, 1)]}
      onClick={(event) => {
        event.stopPropagation();
        const clicked = satellites[event.instanceId];
        if (clicked) {
          onSelectSatellite(clicked.satellite_id);
        }
      }}
    >
      <sphereGeometry args={[0.026, 12, 12]} />
      <meshStandardMaterial vertexColors emissive="#164e63" emissiveIntensity={0.4} />
    </instancedMesh>
  );
}

function SelectedSatelliteLabel({ satellite }) {
  if (!satellite?.geodetic) {
    return null;
  }

  const position = latLonAltToVector3(satellite.geodetic.lat, satellite.geodetic.lon, satellite.geodetic.alt_km + 120);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      <Html distanceFactor={6} position={[0.1, 0.1, 0]}>
        <div className="globe-label emphasized">{satellite.meta?.name || satellite.satellite_name}</div>
      </Html>
    </group>
  );
}

function TrackLine({ track }) {
  if (!track?.points?.length) {
    return null;
  }

  const positions = track.points.map((point) => {
    const vector = latLonAltToVector3(point.geodetic.lat, point.geodetic.lon, point.geodetic.alt_km);
    return [vector.x, vector.y, vector.z];
  });

  return <Line points={positions} color="#f97316" lineWidth={1.5} />;
}

function FootprintLine({ footprint, altitude = 20, color }) {
  const coordinates = footprint?.polygon?.coordinates?.[0];
  if (!coordinates?.length) {
    return null;
  }

  const points = coordinates.map(([lon, lat]) => {
    const vector = latLonAltToVector3(lat, lon, altitude);
    return [vector.x, vector.y, vector.z];
  });

  return <Line points={points} color={color} lineWidth={1} closed />;
}

function SceneContent({ satellites, selectedSatellite, selectedSatelliteId, onSelectSatellite, onSelectPoint, selectedPoint, track, visibilityFootprint, coverageFootprint }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 3, 8]} intensity={2.3} />
      <pointLight position={[-10, -3, -8]} intensity={0.45} color="#60a5fa" />
      <Stars radius={120} depth={60} count={5000} factor={5} saturation={0} fade speed={1} />
      <Earth onSelectPoint={onSelectPoint} selectedPoint={selectedPoint} />
      <SatelliteCloud satellites={satellites} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={onSelectSatellite} />
      <SelectedSatelliteLabel satellite={selectedSatellite} />
      <TrackLine track={track} />
      <FootprintLine footprint={visibilityFootprint} altitude={12} color="#34d399" />
      <FootprintLine footprint={coverageFootprint} altitude={16} color="#a855f7" />
      <OrbitControls enablePan enableZoom enableRotate minDistance={3.2} maxDistance={14} />
    </>
  );
}

export default function Earth3D({ satellites, selectedSatelliteId, onSelectSatellite, onSelectPoint, selectedPoint, track, visibilityFootprint, coverageFootprint }) {
  const selectedSatellite = useMemo(
    () => satellites.find((item) => item.satellite_id === selectedSatelliteId) || null,
    [satellites, selectedSatelliteId]
  );

  return (
    <div className="globe-canvas-shell">
      <Canvas camera={{ position: [0, 4.6, 6.5], fov: 48 }} gl={{ antialias: true }}>
        <SceneContent
          satellites={satellites}
          selectedSatellite={selectedSatellite}
          selectedSatelliteId={selectedSatelliteId}
          onSelectSatellite={onSelectSatellite}
          onSelectPoint={onSelectPoint}
          selectedPoint={selectedPoint}
          track={track}
          visibilityFootprint={visibilityFootprint}
          coverageFootprint={coverageFootprint}
        />
      </Canvas>
    </div>
  );
}
