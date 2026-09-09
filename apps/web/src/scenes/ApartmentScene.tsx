import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { panelConfig } from '../data/mockData'
import type { SolarSnapshot } from '../lib/solar'

export type SceneCameraPreset = 'overview' | 'room' | 'panel'

type ApartmentSceneProps = {
  snapshot: SolarSnapshot
  showRays: boolean
  preset: SceneCameraPreset
  onExposureRatioChange?: (ratio: number) => void
}

const DEG = Math.PI / 180

function toSunVector(snapshot: SolarSnapshot) {
  const altitude = snapshot.altitude * DEG
  const azimuth = snapshot.azimuth * DEG
  return new THREE.Vector3(
    Math.cos(altitude) * Math.sin(azimuth),
    Math.sin(altitude),
    Math.cos(altitude) * Math.cos(azimuth),
  ).normalize()
}

function CameraRig({ preset, controlsRef }: { preset: SceneCameraPreset; controlsRef: MutableRefObject<any> }) {
  const { camera } = useThree()
  const targets = useMemo(() => ({
    overview: { position: new THREE.Vector3(5.7, 3.4, 4.9), target: new THREE.Vector3(0, 1.35, 0) },
    room: { position: new THREE.Vector3(4.2, 2.55, -1.1), target: new THREE.Vector3(0, 1.5, 0) },
    panel: { position: new THREE.Vector3(2.55, 1.8, -0.66), target: new THREE.Vector3(0, 1.55, 0) },
  }), [])

  useEffect(() => {
    const next = targets[preset]
    camera.position.copy(next.position)
    camera.lookAt(next.target)
    camera.updateProjectionMatrix()
    if (controlsRef.current) {
      controlsRef.current.target.copy(next.target)
      controlsRef.current.update()
    }
  }, [camera, controlsRef, preset, targets])

  return null
}

function SceneLighting({ sunVector }: { sunVector: THREE.Vector3 }) {
  const position = sunVector.clone().multiplyScalar(5.5).add(new THREE.Vector3(0, 2.2, 0))
  return <>
    <ambientLight intensity={0.85} color="#a2bfca" />
    <hemisphereLight args={['#f0d9ad', '#10212b', 0.85]} />
    <directionalLight position={position} intensity={2.1} color="#ffd18a" castShadow shadow-mapSize={[1024, 1024]} />
    <directionalLight position={[4, 4, -4]} intensity={0.85} color="#9bd4d2" />
    <pointLight position={[0, 1.7, 0.3]} intensity={0.65} distance={7} color="#5e9da3" />
  </>
}

function RoomStructure({ snapshot, sampleStates, onSampleUpdate }: { snapshot: SolarSnapshot; sampleStates: boolean[]; onSampleUpdate: (values: boolean[]) => void }) {
  const structureRef = useRef<THREE.Group>(null)
  const panelRef = useRef<THREE.Group>(null)
  const yaw = panelConfig.azimuth * DEG

  useEffect(() => {
    const structure = structureRef.current
    const panel = panelRef.current
    if (!structure || !panel) return

    const timer = window.setTimeout(() => {
      const occluders: THREE.Object3D[] = []
      structure.traverse((object) => {
        if (object.userData.occluder) occluders.push(object)
      })
      const direction = toSunVector(snapshot)
      const raycaster = new THREE.Raycaster()
      const values: boolean[] = []
      const columns = 8
      const rows = 12
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const localPoint = new THREE.Vector3(
            -0.43 + (column / (columns - 1)) * 0.86,
            -0.98 + (row / (rows - 1)) * 1.96,
            0.05,
          )
          const worldPoint = panel.localToWorld(localPoint)
          raycaster.set(worldPoint.clone().addScaledVector(direction, 0.012), direction)
          const hit = raycaster.intersectObjects(occluders, true).find((intersection) => intersection.distance > 0.015 && intersection.distance < 8)
          values.push(!hit)
        }
      }
      onSampleUpdate(values)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [onSampleUpdate, snapshot.altitude, snapshot.azimuth])

  const cellLines = useMemo(() => {
    const points: number[] = []
    for (let column = 1; column < 5; column += 1) {
      const x = -0.43 + (column / 5) * 0.86
      points.push(x, -0.98, 0.038, x, 0.98, 0.038)
    }
    for (let row = 1; row < 8; row += 1) {
      const y = -0.98 + (row / 8) * 1.96
      points.push(-0.43, y, 0.038, 0.43, y, 0.038)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return geometry
  }, [])

  return <group ref={structureRef} rotation={[0, yaw, 0]}>
    <mesh position={[0, 1.54, -1.34]} receiveShadow userData={{ occluder: true }}>
      <boxGeometry args={[4.6, 2.82, 0.14]} />
      <meshStandardMaterial color="#25343e" roughness={0.76} metalness={0.06} />
    </mesh>
    <mesh position={[0, 0.16, -0.62]} receiveShadow userData={{ occluder: true }}>
      <boxGeometry args={[4.75, 0.32, 1.8]} />
      <meshStandardMaterial color="#66727a" roughness={0.84} />
    </mesh>
    <mesh position={[-2.16, 1.55, 0]} castShadow receiveShadow userData={{ occluder: true }}>
      <boxGeometry args={[0.32, 3.1, 0.42]} />
      <meshStandardMaterial color="#6c767a" roughness={0.83} />
    </mesh>
    <mesh position={[2.16, 1.55, 0]} castShadow receiveShadow userData={{ occluder: true }}>
      <boxGeometry args={[0.32, 3.1, 0.42]} />
      <meshStandardMaterial color="#6c767a" roughness={0.83} />
    </mesh>
    <mesh position={[0, 3.02, 0]} castShadow receiveShadow userData={{ occluder: true }}>
      <boxGeometry args={[4.64, 0.32, 0.42]} />
      <meshStandardMaterial color="#606d73" roughness={0.83} />
    </mesh>
    <mesh position={[0, 0.32, 0]} castShadow receiveShadow userData={{ occluder: true }}>
      <boxGeometry args={[4.64, 0.32, 0.42]} />
      <meshStandardMaterial color="#606d73" roughness={0.83} />
    </mesh>
    <mesh position={[-1.03, 1.54, 0.048]} castShadow userData={{ occluder: true }}>
      <boxGeometry args={[0.11, 2.7, 0.12]} />
      <meshStandardMaterial color="#6d7476" roughness={0.45} metalness={0.55} />
    </mesh>
    <mesh position={[1.03, 1.54, 0.048]} castShadow userData={{ occluder: true }}>
      <boxGeometry args={[0.11, 2.7, 0.12]} />
      <meshStandardMaterial color="#6d7476" roughness={0.45} metalness={0.55} />
    </mesh>
    <mesh position={[0, 1.43, 0.052]} castShadow userData={{ occluder: true }}>
      <boxGeometry args={[4.18, 0.12, 0.12]} />
      <meshStandardMaterial color="#6d7476" roughness={0.45} metalness={0.55} />
    </mesh>
    <mesh position={[0, 1.54, 0.02]}>
      <boxGeometry args={[4.12, 2.6, 0.035]} />
      <meshPhysicalMaterial color="#31515d" roughness={0.2} metalness={0.05} transmission={0.35} transparent opacity={0.38} />
    </mesh>
    <group ref={panelRef} position={[0, 1.54, 0.005]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.94, 2.06, 0.08]} />
        <meshStandardMaterial color="#101f31" roughness={0.35} metalness={0.48} emissive="#073441" emissiveIntensity={0.45} />
      </mesh>
      <lineSegments geometry={cellLines}>
        <lineBasicMaterial color="#85dcd8" transparent opacity={0.42} />
      </lineSegments>
      <mesh position={[0, 0, 0.052]}>
        <boxGeometry args={[0.99, 2.11, 0.025]} />
        <meshBasicMaterial color="#69d8d0" transparent opacity={0.075} />
      </mesh>
      <group>
        {sampleStates.map((isLit, index) => {
          const row = Math.floor(index / 8)
          const column = index % 8
          return <mesh key={index} position={[-0.43 + (column / 7) * 0.86, -0.98 + (row / 11) * 1.96, 0.07]}>
            <sphereGeometry args={[0.018, 5, 5]} />
            <meshBasicMaterial color={isLit ? '#78e5d8' : '#d27d58'} transparent opacity={isLit ? 0.82 : 0.3} />
          </mesh>
        })}
      </group>
    </group>
    <mesh position={[0, 0.9, 0.63]} userData={{ occluder: true }}>
      <boxGeometry args={[4.48, 0.055, 0.055]} />
      <meshStandardMaterial color="#3f555e" metalness={0.6} roughness={0.28} />
    </mesh>
    <mesh position={[-2.14, 0.9, 0.63]} userData={{ occluder: true }}>
      <boxGeometry args={[0.055, 0.88, 0.055]} />
      <meshStandardMaterial color="#3f555e" metalness={0.6} roughness={0.28} />
    </mesh>
    <mesh position={[2.14, 0.9, 0.63]} userData={{ occluder: true }}>
      <boxGeometry args={[0.055, 0.88, 0.055]} />
      <meshStandardMaterial color="#3f555e" metalness={0.6} roughness={0.28} />
    </mesh>
  </group>
}

function SunObject({ snapshot, showRays }: { snapshot: SolarSnapshot; showRays: boolean }) {
  const sunVector = useMemo(() => toSunVector(snapshot), [snapshot])
  const sunPosition = useMemo(() => sunVector.clone().multiplyScalar(4.8).add(new THREE.Vector3(0, 2.25, 0)), [sunVector])
  const rayEnd = useMemo(() => sunPosition.clone(), [sunPosition])
  return <>
    <mesh position={sunPosition}>
      <sphereGeometry args={[0.18, 20, 20]} />
      <meshBasicMaterial color="#ffe1a0" />
    </mesh>
    <mesh position={sunPosition}>
      <sphereGeometry args={[0.32, 20, 20]} />
      <meshBasicMaterial color="#f6bd53" transparent opacity={0.13} />
    </mesh>
    {showRays && <Line points={[[0, 1.54, 0], rayEnd.toArray() as [number, number, number]]} color="#f3c25d" transparent opacity={0.76} dashed dashSize={0.09} gapSize={0.075} lineWidth={1.2} />}
  </>
}

function GroundGrid() {
  return <>
    <gridHelper args={[12, 18, '#31505a', '#1b303b']} position={[0, 0, 0]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
      <planeGeometry args={[12, 12]} />
      <meshBasicMaterial color="#0b1821" transparent opacity={0.74} />
    </mesh>
  </>
}

function ApartmentSceneCanvas({ snapshot, showRays, preset, onExposureRatioChange }: ApartmentSceneProps) {
  const controlsRef = useRef<any>(null)
  const sunVector = useMemo(() => toSunVector(snapshot), [snapshot])
  const [sampleStates, setSampleStates] = useState<boolean[]>(() => Array.from({ length: 96 }, () => true))
  const onSampleUpdate = useCallback((values: boolean[]) => {
    setSampleStates(values)
    onExposureRatioChange?.(values.filter(Boolean).length / values.length)
  }, [onExposureRatioChange])

  return <Canvas shadows="basic" dpr={[1, 1.6]} gl={{ antialias: true }}>
    <color attach="background" args={['#0b1821']} />
    <fog attach="fog" args={['#0b1821', 8, 16]} />
    <PerspectiveCamera makeDefault fov={38} near={0.1} far={30} position={[4.2, 2.55, -1.1]} />
    <CameraRig preset={preset} controlsRef={controlsRef} />
    <SceneLighting sunVector={sunVector} />
    <GroundGrid />
    <RoomStructure snapshot={snapshot} sampleStates={sampleStates} onSampleUpdate={onSampleUpdate} />
    <SunObject snapshot={snapshot} showRays={showRays} />
    <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} minDistance={2.5} maxDistance={11} maxPolarAngle={Math.PI / 2.02} target={[0, 1.5, 0]} />
  </Canvas>
}

export default function ApartmentScene(props: ApartmentSceneProps) {
  return <ApartmentSceneCanvas {...props} />
}
