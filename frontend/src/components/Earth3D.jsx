import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import {
  EARTH_RADIUS_UNITS,
  currentGeodeticFromPosition,
  ecefToVector3,
  extrapolatePositionToVector3,
  footprintAngularRadiusDeg,
  latLonAltToVector3,
  sphericalCirclePolygon,
  vector3ToLatLon,
} from '../utils/coordinates';
import worldData from '../assets/world-lowres.json';

const DEFAULT_FANCY_RENDERING = String(process.env.REACT_APP_FANCY || '').toLowerCase() === 'true';

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

function SatelliteCloudFast({
  satellites,
  timeRef,
  selectedSatelliteId,
  renderedPositionsRef,
  renderedIdsRef,
}) {
  const geometryRef = useRef(null);

  const satelliteIds = useMemo(() => satellites.map((s) => s.satellite_id), [satellites]);

  useEffect(() => {
    renderedIdsRef.current = satelliteIds;
  }, [satelliteIds, renderedIdsRef]);

  useFrame(() => {
    if (!geometryRef.current) return;

    let posAttr = geometryRef.current.attributes.position;
    let colAttr = geometryRef.current.attributes.color;

    if (!posAttr || posAttr.array.length !== satellites.length * 3) {
      const pArr = new Float32Array(satellites.length * 3);
      const cArr = new Float32Array(satellites.length * 3);
      geometryRef.current.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
      geometryRef.current.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
      renderedPositionsRef.current = pArr;
      posAttr = geometryRef.current.attributes.position;
      colAttr = geometryRef.current.attributes.color;
    }

    const positionsArray = posAttr.array;
    const colorsArray = colAttr.array;
    const defaultColor = new THREE.Color('#7dd3fc');
    const selectedColor = new THREE.Color('#f59e0b');
    const currentMs = timeRef.current;

    for (let index = 0; index < satellites.length; index += 1) {
      const position = extrapolatePositionToVector3(satellites[index], currentMs);
      if (position) {
        positionsArray[index * 3] = position.x;
        positionsArray[index * 3 + 1] = position.y;
        positionsArray[index * 3 + 2] = position.z;
      } else {
        positionsArray[index * 3] = 0;
        positionsArray[index * 3 + 1] = 0;
        positionsArray[index * 3 + 2] = 0;
      }
      
      const isSelected = satelliteIds[index] === selectedSatelliteId;
      const color = isSelected ? selectedColor : defaultColor;
      colorsArray[index * 3] = color.r;
      colorsArray[index * 3 + 1] = color.g;
      colorsArray[index * 3 + 2] = color.b;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial
        size={0.07}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.96}
        depthWrite={false}
      />
    </points>
  );
}

function SatelliteCloudFancy({
  satellites,
  timeRef,
  selectedSatelliteId,
  renderedPositionsRef,
  renderedIdsRef,
}) {
  const instancedRef = useRef(null);
  const glowRef = useRef(null);
  
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);

  const satelliteIds = useMemo(() => satellites.map((s) => s.satellite_id), [satellites]);

  useEffect(() => {
    renderedIdsRef.current = satelliteIds;
  }, [satelliteIds, renderedIdsRef]);

  useFrame(() => {
    if (!instancedRef.current || !glowRef.current) return;

    if (!renderedPositionsRef.current || renderedPositionsRef.current.length !== satellites.length * 3) {
      renderedPositionsRef.current = new Float32Array(satellites.length * 3);
    }
    const positionsArray = renderedPositionsRef.current;

    const defaultColor = new THREE.Color('#c8f1ff');
    const selectedColor = new THREE.Color('#f59e0b');
    const glowDefault = new THREE.Color('#60a5fa');
    const glowSelected = new THREE.Color('#fbbf24');

    const currentMs = timeRef.current;

    for (let index = 0; index < satellites.length; index += 1) {
      const position = extrapolatePositionToVector3(satellites[index], currentMs);
      if (position) {
        positionsArray[index * 3] = position.x;
        positionsArray[index * 3 + 1] = position.y;
        positionsArray[index * 3 + 2] = position.z;
        tempPosition.copy(position);
      } else {
        positionsArray[index * 3] = 0;
        positionsArray[index * 3 + 1] = 0;
        positionsArray[index * 3 + 2] = 0;
        tempPosition.set(0, 0, 0);
      }

      const isSelected = satelliteIds[index] === selectedSatelliteId;

      tempScale.setScalar(isSelected ? 1.8 : 1);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      instancedRef.current.setMatrixAt(index, tempMatrix);
      instancedRef.current.setColorAt(index, isSelected ? selectedColor : defaultColor);

      tempScale.setScalar(isSelected ? 2.6 : 1.45);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      glowRef.current.setMatrixAt(index, tempMatrix);
      glowRef.current.setColorAt(index, isSelected ? glowSelected : glowDefault);
    }

    instancedRef.current.count = satellites.length;
    glowRef.current.count = satellites.length;
    
    instancedRef.current.instanceMatrix.needsUpdate = true;
    glowRef.current.instanceMatrix.needsUpdate = true;
    if (instancedRef.current.instanceColor) instancedRef.current.instanceColor.needsUpdate = true;
    if (glowRef.current.instanceColor) glowRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={glowRef} args={[null, null, Math.max(satellites.length, 1)]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 7, 7]} />
        <meshBasicMaterial transparent opacity={0.22} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={instancedRef} args={[null, null, Math.max(satellites.length, 1)]} frustumCulled={false}>
        <sphereGeometry args={[0.024, 10, 10]} />
        <meshStandardMaterial emissive="#5ab5ff" emissiveIntensity={0.55} roughness={0.32} metalness={0.08} />
      </instancedMesh>
    </group>
  );
}

function SatelliteCloud({ fancy = DEFAULT_FANCY_RENDERING, ...props }) {
  return fancy ? <SatelliteCloudFancy {...props} /> : <SatelliteCloudFast {...props} />;
}

function SelectedSatelliteMarker({ satellite, timeRef }) {
  const meshRef = useRef(null);
  const glowRef = useRef(null);
  const groupRef = useRef(null);

  useFrame(() => {
    if (!satellite || !meshRef.current || !glowRef.current || !groupRef.current) return;
    const position = extrapolatePositionToVector3(satellite, timeRef.current);
    if (position) {
      meshRef.current.position.copy(position);
      glowRef.current.position.copy(position);
      groupRef.current.position.copy(position).multiplyScalar(1.08);
    }
  });

  if (!satellite) return null;

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      <mesh ref={glowRef} scale={2.2}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.15} />
      </mesh>
      <group ref={groupRef}>
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
    const vector = point?.ecef
      ? ecefToVector3(point.ecef)
      : point?.geodetic
        ? latLonAltToVector3(point.geodetic.lat, point.geodetic.lon, point.geodetic.alt_km)
        : null;
    if (!vector) return;

    const current = [vector.x, vector.y, vector.z];

    if (!previousPoint) {
      currentSegment.push(current);
      previousPoint = point;
      return;
    }

    const timeDeltaMs = Math.abs(new Date(point.timestamp).getTime() - new Date(previousPoint.timestamp).getTime());
    const previousVector = previousPoint?.ecef
      ? ecefToVector3(previousPoint.ecef)
      : previousPoint?.geodetic
        ? latLonAltToVector3(previousPoint.geodetic.lat, previousPoint.geodetic.lon, previousPoint.geodetic.alt_km)
        : null;
    const gapDistance = previousVector ? previousVector.distanceTo(vector) : 0;

    if (timeDeltaMs > (track.step_seconds * 2500) || gapDistance > 1.6) {
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

function FootprintLine({ footprint, selectedSatellite, timeRef, altitudeOffsetKm = 2, color, kind, minElevationDeg = 15 }) {
  const geometryRef = useRef(null);

  const hasData = Boolean(selectedSatellite || footprint?.polygon?.coordinates?.[0]?.length);

  useFrame(() => {
    if (!geometryRef.current || !hasData) return;

    const dynamicCenter = currentGeodeticFromPosition(selectedSatellite, timeRef.current);
    const angularRadiusDeg = dynamicCenter
      ? footprintAngularRadiusDeg(dynamicCenter.alt_km, kind, minElevationDeg)
      : Number.isFinite(footprint?.angular_radius_deg)
        ? footprint.angular_radius_deg
        : null;

    const coordinates = dynamicCenter && angularRadiusDeg != null
      ? sphericalCirclePolygon(dynamicCenter.lat, dynamicCenter.lon, angularRadiusDeg, 96)
      : footprint?.polygon?.coordinates?.[0];

    if (!coordinates?.length) {
      geometryRef.current.setDrawRange(0, 0);
      return;
    }

    let posAttr = geometryRef.current.attributes.position;
    if (!posAttr || posAttr.array.length !== coordinates.length * 3) {
      const arr = new Float32Array(coordinates.length * 3);
      geometryRef.current.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      posAttr = geometryRef.current.attributes.position;
    }

    const positions = posAttr.array;
    for (let i = 0; i < coordinates.length; i += 1) {
      const [lon, lat] = coordinates[i];
      const vector = latLonAltToVector3(lat, lon, altitudeOffsetKm);
      positions[i * 3] = vector.x;
      positions[i * 3 + 1] = vector.y;
      positions[i * 3 + 2] = vector.z;
    }

    geometryRef.current.setDrawRange(0, coordinates.length);
    posAttr.needsUpdate = true;
  });

  if (!hasData) return null;

  return (
    <lineLoop>
      <bufferGeometry ref={geometryRef} />
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

    const handleKeyDown = (event) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        onSelectPoint(null);
        onSelectSatellite(null);
      }
    };

    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [camera, gl, onSelectPoint, onSelectSatellite, renderedIdsRef, renderedPositionsRef, size]);

  return null;
}

function SceneContent({
  satellites,
  currentTime,
  isPlaying,
  speedMultiplier,
  selectedSatellite,
  selectedSatelliteId,
  onSelectSatellite,
  onSelectPoint,
  selectedPoint,
  track,
  visibilityFootprint,
  elevationFootprint,
  minElevationDeg = 15,
  fancyMode = DEFAULT_FANCY_RENDERING,
}) {
  const renderedPositionsRef = useRef(new Float32Array(0));
  const renderedIdsRef = useRef([]);

  const timeRef = useRef(currentTime.getTime());

  useEffect(() => {
    if (!isPlaying || Math.abs(currentTime.getTime() - timeRef.current) > 1000) {
      timeRef.current = currentTime.getTime();
    }
  }, [currentTime, isPlaying]);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * 1000 * speedMultiplier;
    }
  });

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
        timeRef={timeRef}
        selectedSatelliteId={selectedSatelliteId}
        renderedPositionsRef={renderedPositionsRef}
        renderedIdsRef={renderedIdsRef}
        fancy={fancyMode}
      />
      <SelectedSatelliteMarker satellite={selectedSatellite} timeRef={timeRef} />
      <TrackLine track={track} />
      <FootprintLine
        footprint={visibilityFootprint}
        selectedSatellite={selectedSatellite}
        timeRef={timeRef}
        altitudeOffsetKm={3}
        color="#34d399"
        kind="visibility"
      />
      <FootprintLine
        footprint={elevationFootprint}
        selectedSatellite={selectedSatellite}
        timeRef={timeRef}
        altitudeOffsetKm={5}
        color="#a855f7"
        kind="min_elevation"
        minElevationDeg={minElevationDeg}
      />

      <OrbitControls enablePan enableZoom enableRotate minDistance={3.2} maxDistance={14} />
    </>
  );
}

export default function Earth3D({
  satellites,
  currentTime,
  isPlaying,
  speedMultiplier,
  selectedSatellite,
  selectedSatelliteId,
  onSelectSatellite,
  onSelectPoint,
  selectedPoint,
  track,
  visibilityFootprint,
  elevationFootprint,
  minElevationDeg = 15,
  fancyMode = DEFAULT_FANCY_RENDERING,
}) {
  return (
    <div className="globe-canvas-shell">
      <Canvas
        key={fancyMode ? 'fancy' : 'fast'}
        dpr={[1, 1.5]}
        camera={{ position: [0, 4.6, 6.5], fov: 48 }}
        gl={{ antialias: fancyMode, powerPreference: 'high-performance' }}
      >
        <SceneContent
          satellites={satellites}
          currentTime={currentTime}
          isPlaying={isPlaying}
          speedMultiplier={speedMultiplier}
          selectedSatellite={selectedSatellite}
          selectedSatelliteId={selectedSatelliteId}
          onSelectSatellite={onSelectSatellite}
          onSelectPoint={onSelectPoint}
          selectedPoint={selectedPoint}
          track={track}
          visibilityFootprint={visibilityFootprint}
          elevationFootprint={elevationFootprint}
          minElevationDeg={minElevationDeg}
          fancyMode={fancyMode}
        />
      </Canvas>
    </div>
  );
}
