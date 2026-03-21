import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import {
  EARTH_RADIUS_UNITS,
  currentGeodeticFromPosition,
  extrapolatePositionToVector3,
  footprintAngularRadiusDeg,
  latLonAltToVector3,
  sphericalCirclePolygon,
  vector3ToLatLon,
} from '../utils/coordinates';
import worldData from '../assets/world-lowres.json';

const FANCY_RENDERING = String(process.env.REACT_APP_FANCY || '').toLowerCase() === 'true';

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
          if (pointIndex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
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
    cloudContext.ellipse(
      Math.random() * cloudCanvas.width,
      Math.random() * cloudCanvas.height,
      24 + Math.random() * 120,
      10 + Math.random() * 34,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    cloudContext.fill();
  }
  context.drawImage(cloudCanvas, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createFancyPointTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.36, 'rgba(125,211,252,0.92)');
  gradient.addColorStop(0.72, 'rgba(59,130,246,0.32)');
  gradient.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function Earth({ selectedPoint }) {
  const earthTexture = useMemo(() => createEarthTexture(), []);

  useEffect(() => () => {
    earthTexture.dispose();
  }, [earthTexture]);

  return (
    <group>
      <mesh rotation={[0, -Math.PI / 2, 0]}>
        <sphereGeometry args={[EARTH_RADIUS_UNITS, 96, 96]} />
        <meshStandardMaterial map={earthTexture} roughness={0.92} metalness={0.02} />
      </mesh>

      <mesh scale={1.02}>
        <sphereGeometry args={[EARTH_RADIUS_UNITS, 48, 48]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>

      {selectedPoint ? (
        <mesh position={latLonAltToVector3(selectedPoint.lat, selectedPoint.lon, 30)}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color="#f59e0b" />
          <Html distanceFactor={8} position={[0.08, 0.08, 0]}>
            <div className="globe-label">Выбранная точка</div>
          </Html>
        </mesh>
      ) : null}
    </group>
  );
}

function CountryBorders() {
  const positions = useMemo(() => {
    const vertices = [];
    worldData.countries.forEach((country) => {
      country.polygons.forEach((polygon) => {
        polygon.forEach((ring) => {
          for (let index = 0; index < ring.length; index += 1) {
            const current = ring[index];
            const next = ring[(index + 1) % ring.length];
            const currentVector = latLonAltToVector3(current[1], current[0], 2);
            const nextVector = latLonAltToVector3(next[1], next[0], 2);
            vertices.push(
              currentVector.x,
              currentVector.y,
              currentVector.z,
              nextVector.x,
              nextVector.y,
              nextVector.z
            );
          }
        });
      });
    });
    return new Float32Array(vertices);
  }, []);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#dbe8f3" transparent opacity={0.62} />
    </lineSegments>
  );
}

function SatelliteCloud({
  satellites,
  currentTime,
  selectedSatelliteId,
  renderedPositionsRef,
  renderedIdsRef,
}) {
  const fancyTexture = useMemo(() => (FANCY_RENDERING ? createFancyPointTexture() : null), []);
  const geometryRef = useRef(null);
  const materialRef = useRef(null);

  const { positions, colors, satelliteIds } = useMemo(() => {
    const positionsArray = new Float32Array(satellites.length * 3);
    const colorsArray = new Float32Array(satellites.length * 3);
    const ids = new Array(satellites.length);
    const defaultColor = new THREE.Color(FANCY_RENDERING ? '#b9e9ff' : '#7dd3fc');
    const selectedColor = new THREE.Color('#f59e0b');

    satellites.forEach((satellite, index) => {
      const position = extrapolatePositionToVector3(satellite, currentTime);
      ids[index] = satellite.satellite_id;
      if (position) {
        positionsArray[index * 3] = position.x;
        positionsArray[index * 3 + 1] = position.y;
        positionsArray[index * 3 + 2] = position.z;
      }
      const color = satellite.satellite_id === selectedSatelliteId ? selectedColor : defaultColor;
      colorsArray[index * 3] = color.r;
      colorsArray[index * 3 + 1] = color.g;
      colorsArray[index * 3 + 2] = color.b;
    });

    return { positions: positionsArray, colors: colorsArray, satelliteIds: ids };
  }, [satellites, currentTime, selectedSatelliteId]);

  useEffect(() => {
    renderedPositionsRef.current = positions;
    renderedIdsRef.current = satelliteIds;
    if (geometryRef.current) {
      geometryRef.current.attributes.position.needsUpdate = true;
      geometryRef.current.attributes.color.needsUpdate = true;
      geometryRef.current.computeBoundingSphere();
    }
  }, [positions, colors, satelliteIds, renderedPositionsRef, renderedIdsRef]);

  useEffect(() => () => {
    if (fancyTexture) fancyTexture.dispose();
  }, [fancyTexture]);

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={FANCY_RENDERING ? 0.12 : 0.07}
        sizeAttenuation
        vertexColors
        transparent
        opacity={FANCY_RENDERING ? 1 : 0.96}
        depthWrite={false}
        map={fancyTexture || undefined}
        alphaMap={fancyTexture || undefined}
        alphaTest={FANCY_RENDERING ? 0.02 : 0}
        blending={FANCY_RENDERING ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}

function SelectedSatelliteMarker({ satellite, currentTime }) {
  const position = useMemo(
    () => (satellite ? extrapolatePositionToVector3(satellite, currentTime) : null),
    [satellite, currentTime]
  );

  if (!satellite || !position) return null;

  const labelPosition = position.clone().multiplyScalar(1.08);

  return (
    <group>
      <mesh position={position}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      <mesh position={position} scale={2.2}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.15} />
      </mesh>
      <group position={labelPosition}>
        <Html distanceFactor={6}>
          <div className="globe-label emphasized">{satellite.meta?.name || satellite.satellite_name}</div>
        </Html>
      </group>
    </group>
  );
}

function buildTrackSegments(track) {
  if (!track?.points?.length) return [];

  const segments = [];
  let currentSegment = [];
  let previousPoint = null;

  track.points.forEach((point) => {
    if (!point?.geodetic) return;
    const vector = latLonAltToVector3(point.geodetic.lat, point.geodetic.lon, point.geodetic.alt_km);
    const current = [vector.x, vector.y, vector.z];

    if (!previousPoint) {
      currentSegment.push(current);
      previousPoint = point;
      return;
    }

    const lonDelta = Math.abs(point.geodetic.lon - previousPoint.geodetic.lon);
    const timeDeltaMs = Math.abs(new Date(point.timestamp).getTime() - new Date(previousPoint.timestamp).getTime());

    if (lonDelta > 120 || timeDeltaMs > (track.step_seconds * 2000)) {
      if (currentSegment.length > 1) segments.push(currentSegment);
      currentSegment = [current];
    } else {
      currentSegment.push(current);
    }

    previousPoint = point;
  });

  if (currentSegment.length > 1) segments.push(currentSegment);
  return segments;
}

function TrackLine({ track }) {
  const segments = useMemo(() => buildTrackSegments(track), [track]);
  if (!segments.length) return null;

  return (
    <group>
      {segments.map((segment, index) => (
        <line key={`track-${index}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array(segment.flat()), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#f97316" />
        </line>
      ))}
    </group>
  );
}

function FootprintLine({ footprint, selectedSatellite, currentTime, altitudeOffsetKm = 2, color, kind }) {
  const points = useMemo(() => {
    const dynamicCenter = currentGeodeticFromPosition(selectedSatellite, currentTime);
    const angularRadiusDeg = Number.isFinite(footprint?.angular_radius_deg)
      ? footprint.angular_radius_deg
      : dynamicCenter
        ? footprintAngularRadiusDeg(dynamicCenter.alt_km, kind)
        : null;

    const coordinates = dynamicCenter && angularRadiusDeg != null
      ? sphericalCirclePolygon(dynamicCenter.lat, dynamicCenter.lon, angularRadiusDeg, 96)
      : footprint?.polygon?.coordinates?.[0];

    if (!coordinates?.length) return null;
    const vertices = [];
    coordinates.forEach(([lon, lat]) => {
      const vector = latLonAltToVector3(lat, lon, altitudeOffsetKm);
      vertices.push(vector.x, vector.y, vector.z);
    });
    return new Float32Array(vertices);
  }, [altitudeOffsetKm, currentTime, footprint, kind, selectedSatellite]);

  if (!points) return null;

  return (
    <lineLoop>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} />
    </lineLoop>
  );
}

function isOccludedByEarth(cameraPosition, pointPosition) {
  const direction = pointPosition.clone().sub(cameraPosition);
  const distanceToPoint = direction.length();
  if (distanceToPoint <= 0) return false;
  direction.normalize();

  const a = 1;
  const b = 2 * cameraPosition.dot(direction);
  const c = cameraPosition.lengthSq() - EARTH_RADIUS_UNITS * EARTH_RADIUS_UNITS;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return false;

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDiscriminant) / (2 * a);
  const t2 = (-b + sqrtDiscriminant) / (2 * a);
  const nearestHit = [t1, t2].filter((value) => value > 0).sort((left, right) => left - right)[0];
  return Number.isFinite(nearestHit) && nearestHit < distanceToPoint - 0.02;
}

function pickSatelliteAtPixel({ clientX, clientY, camera, size, positions, ids }) {
  if (!positions?.length || !ids?.length) return null;

  const vector = new THREE.Vector3();
  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const clickRadiusPx = 14;

  for (let index = 0; index < ids.length; index += 1) {
    vector.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    if (isOccludedByEarth(camera.position, vector)) continue;

    const projected = vector.clone().project(camera);
    if (projected.z < -1 || projected.z > 1) continue;

    const x = (projected.x * 0.5 + 0.5) * size.width;
    const y = (-projected.y * 0.5 + 0.5) * size.height;
    const distance = Math.hypot(clientX - x, clientY - y);
    if (distance <= clickRadiusPx && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = ids[index];
    }
  }

  return bestMatch;
}

function InteractionController({ renderedPositionsRef, renderedIdsRef, onSelectSatellite, onSelectPoint }) {
  const { camera, gl, size } = useThree();
  const pointerDownRef = useRef(null);

  useEffect(() => {
    const domElement = gl.domElement;

    const handlePointerDown = (event) => {
      pointerDownRef.current = {
        button: event.button,
        x: event.clientX,
        y: event.clientY,
      };
    };

    const handlePointerUp = (event) => {
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!start || start.button !== 0 || event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;

      const rect = domElement.getBoundingClientRect();
      const clientX = event.clientX - rect.left;
      const clientY = event.clientY - rect.top;

      const selectedSatelliteId = pickSatelliteAtPixel({
        clientX,
        clientY,
        camera,
        size,
        positions: renderedPositionsRef.current,
        ids: renderedIdsRef.current,
      });

      if (selectedSatelliteId) {
        onSelectSatellite(selectedSatelliteId);
        return;
      }

      const pointer = new THREE.Vector2(
        (clientX / size.width) * 2 - 1,
        -(clientY / size.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const intersection = raycaster.ray.intersectSphere(
        new THREE.Sphere(new THREE.Vector3(0, 0, 0), EARTH_RADIUS_UNITS),
        new THREE.Vector3()
      );
      if (intersection) {
        onSelectPoint(vector3ToLatLon(intersection));
      }
    };

    const handleContextMenu = (event) => event.preventDefault();

    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('contextmenu', handleContextMenu);

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [camera, gl, onSelectPoint, onSelectSatellite, renderedIdsRef, renderedPositionsRef, size]);

  return null;
}

function SceneContent({
  satellites,
  currentTime,
  selectedSatellite,
  selectedSatelliteId,
  onSelectSatellite,
  onSelectPoint,
  selectedPoint,
  track,
  visibilityFootprint,
  coverageFootprint,
}) {
  const renderedPositionsRef = useRef(new Float32Array(0));
  const renderedIdsRef = useRef([]);

  return (
    <>
      <ambientLight intensity={0.68} />
      <directionalLight position={[6, 3, 8]} intensity={2.25} />
      <pointLight position={[-10, -3, -8]} intensity={0.5} color="#60a5fa" />
      <Stars radius={120} depth={60} count={4000} factor={5} saturation={0} fade speed={1} />

      <InteractionController
        renderedPositionsRef={renderedPositionsRef}
        renderedIdsRef={renderedIdsRef}
        onSelectSatellite={onSelectSatellite}
        onSelectPoint={onSelectPoint}
      />
      <Earth selectedPoint={selectedPoint} />
      <CountryBorders />
      <SatelliteCloud
        satellites={satellites}
        currentTime={currentTime}
        selectedSatelliteId={selectedSatelliteId}
        renderedPositionsRef={renderedPositionsRef}
        renderedIdsRef={renderedIdsRef}
      />
      <SelectedSatelliteMarker satellite={selectedSatellite} currentTime={currentTime} />
      <TrackLine track={track} />
      <FootprintLine
        footprint={visibilityFootprint}
        selectedSatellite={selectedSatellite}
        currentTime={currentTime}
        altitudeOffsetKm={3}
        color="#34d399"
        kind="visibility"
      />
      <FootprintLine
        footprint={coverageFootprint}
        selectedSatellite={selectedSatellite}
        currentTime={currentTime}
        altitudeOffsetKm={5}
        color="#a855f7"
        kind="coverage"
      />

      <OrbitControls enablePan enableZoom enableRotate minDistance={3.2} maxDistance={14} />
    </>
  );
}

export default function Earth3D({
  satellites,
  currentTime,
  selectedSatellite,
  selectedSatelliteId,
  onSelectSatellite,
  onSelectPoint,
  selectedPoint,
  track,
  visibilityFootprint,
  coverageFootprint,
}) {
  return (
    <div className="globe-canvas-shell">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 4.6, 6.5], fov: 48 }}
        gl={{ antialias: FANCY_RENDERING, powerPreference: 'high-performance' }}
      >
        <SceneContent
          satellites={satellites}
          currentTime={currentTime}
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
