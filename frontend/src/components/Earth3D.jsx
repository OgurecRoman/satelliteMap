import React from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

// Компонент для текстурированной сферы (Земля)
function Earth() {
  const earthRef = React.useRef();
  const textureLoader = new THREE.TextureLoader();

  // Загрузка текстур (можно использовать бесплатные из NASA или других источников)
  const [colorMap] = React.useMemo(() => {
    return [
      textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg')
    ];
  }, []);

  useFrame((state) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += 0.002; // медленное вращение по Y
    }
  });

  return (
    <mesh ref={earthRef} position={[0, 0, 0]}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshPhongMaterial
        color="#1a73e8"
        emissive="#000"
        emissiveIntensity={0.1}
        // specular="#ffffff"
        shininess={5}
        map={colorMap}
        // bumpMap={bumpMap}
        // bumpScale={0.05}
        // specularMap={specularMap}
      />
    </mesh>
  );
}

// Главный компонент с сценой
export default function Earth3D() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [3, 2, 5], fov: 50 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <Earth />
        <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} />
        {/* Опционально: подпись */}
        <Text
          position={[0, 1.5, 0]}
          fontSize={0.2}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          Earth 3D
        </Text>
      </Canvas>
    </div>
  );
}