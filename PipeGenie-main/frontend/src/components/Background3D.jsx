import React, { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, Float, Sphere, MeshDistortMaterial } from '@react-three/drei'

function AnimatedSphere() {
  return (
    <Float speed={2} rotationIntensity={2} floatIntensity={1.5}>
      <Sphere visible args={[1, 100, 200]} scale={2.5}>
        <MeshDistortMaterial
          color="#4f46e5"
          attach="material"
          distort={0.4}
          speed={1.5}
          roughness={0.1}
          metalness={0.9}
        />
      </Sphere>
    </Float>
  )
}

function Particles() {
  const ref = useRef()
  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y -= delta / 10
      ref.current.rotation.x -= delta / 15
    }
  })
  
  return (
    <group ref={ref}>
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
    </group>
  )
}

export default function Background3D() {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1, background: '#050508' }}>
      <Canvas camera={{ position: [0, 0, 7] }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} />
        <pointLight position={[-10, -10, -5]} color="#7c3aed" intensity={3} />
        <AnimatedSphere />
        <Particles />
      </Canvas>
    </div>
  )
}
