import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { getBuildings, getInstallation, rotateY, siteRotation, windowBlocks, type Block, type SiteSettings, type Vec3 } from '../lib/buildings'
import { sunDirection, type SolarSnapshot } from '../lib/solar'
import { SceneNavigation, SceneNavigationUpdater, SkySun, skySunPosition, useNavigationRefs, type NavigationRefs } from './SceneNavigation'
import { weatherKind, type WeatherKind, type WeatherSample } from '../lib/weather'

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

export type SceneCameraPreset = 'overview' | 'north' | 'room' | 'panel'
type Props = { snapshot: SolarSnapshot; showRays: boolean; preset: SceneCameraPreset; site: SiteSettings; particles: boolean }

// Convert geographic +Z north to Three.js −Z north; keeps north-up views unmirrored.
const scenePoint = ([x, y, z]: Vec3): Vec3 => [x, y, -z]

function CameraRig({ preset, site, controls }: { preset: SceneCameraPreset; site: SiteSettings; controls: RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree()
  useEffect(() => {
    const installation = getInstallation(site)
    const target = preset === 'overview' || preset === 'north' ? new THREE.Vector3(0, 25, 0) : new THREE.Vector3(...scenePoint(installation.world))
    const offset: Vec3 = preset === 'overview' ? [200, 145, -125] : preset === 'north' ? [0, 310, -0.01] : rotateY(preset === 'room' ? [6, 4, 11] : [0.9, 0.6, 4.8], installation.yaw)
    // Clear drag inertia before applying a preset; otherwise north-up inherits the old rotation.
    if (controls.current) {
      const damping = controls.current.enableDamping
      controls.current.enableDamping = false
      controls.current.update()
      controls.current.enableDamping = damping
    }
    camera.up.set(0, 1, 0)
    camera.position.copy(target).add(new THREE.Vector3(...scenePoint(offset)))
    camera.lookAt(target)
    if (controls.current) { controls.current.target.copy(target); controls.current.update() }
  }, [camera, controls, preset, site])
  return null
}
function Box({ block, color = '#748d99' }: { block: Block; color?: string }) {
  return <mesh position={block.center} castShadow receiveShadow><boxGeometry args={block.size} /><meshStandardMaterial color={color} roughness={0.75} metalness={0.15} /></mesh>
}
function BuildingWindows({ block, selected }: { block: Block; selected: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const matrices = useMemo(() => {
    const result: THREE.Matrix4[] = []
    const [w, h, d] = block.size
    const dummy = new THREE.Object3D()
    for (let floor = 1; floor < Math.round(h / 3); floor++) {
      const y = -h / 2 + floor * 3 + 1.2
      for (let side = 0; side < 4; side++) {
        const width = side < 2 ? w : d
        for (let col = 0; col < Math.floor(width / 3.4); col++) {
          const x = -width / 2 + 2 + col * 3.4
          dummy.position.set(side < 2 ? x : (side === 2 ? w / 2 + 0.035 : -w / 2 - 0.035), y, side < 2 ? (side === 0 ? d / 2 + 0.035 : -d / 2 - 0.035) : x)
          dummy.rotation.set(0, side < 2 ? 0 : Math.PI / 2, 0)
          dummy.scale.set(1, 1, 1); dummy.updateMatrix(); result.push(dummy.matrix.clone())
        }
      }
    }
    return result
  }, [block])
  useLayoutEffect(() => {
    if (!mesh.current) return
    matrices.forEach((matrix, i) => mesh.current!.setMatrixAt(i, matrix))
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [matrices])
  return <instancedMesh ref={mesh} position={block.center} args={[undefined, undefined, matrices.length]}><boxGeometry args={[1.55, 1.7, 0.05]} /><meshStandardMaterial color={selected ? '#214d5d' : '#233d4d'} roughness={0.28} metalness={0.45} emissive={selected ? '#387d83' : '#294550'} emissiveIntensity={0.28} /></instancedMesh>
}
function Building({ block, detail }: { block: Block; detail: boolean }) {
  const selected = block.id.startsWith('C2')
  const h = block.size[1]
  return <group>
    <Box block={block} color={selected ? '#90aaab' : block.id === 'B2' ? '#4b666a' : '#657d8d'} />
    {detail && <BuildingWindows block={block} selected={selected} />}
    {block.id !== 'B2' && <>
      <Box block={{ id: 'roof', center: [block.center[0], h + 0.25, block.center[2]], size: [block.size[0] + 0.7, 0.5, block.size[2] + 0.7] }} color={selected ? '#b0c3bc' : '#94a5ad'} />
      <Box block={{ id: 'service', center: [block.center[0], h + 1.4, block.center[2]], size: [block.size[0] * 0.38, 2.3, block.size[2] * 0.45] }} color="#71828c" />
      {Array.from({ length: Math.floor(h / 3) - 1 }, (_, i) => <Box key={i} block={{ id: 'slab', center: [block.center[0], (i + 1) * 3, block.center[2]], size: [block.size[0] + 0.15, 0.12, block.size[2] + 0.15] }} color={selected ? '#6d999b' : '#516d7c'} />)}
    </>}

  </group>
}
function Landscape({ labels }: { labels: boolean }) {
  const trees = useMemo(() => Array.from({ length: 42 }, (_, i): Vec3 => i < 20 ? [-73 + i * 6.2, 1.8, 66] : [57, 1.8, -74 + (i - 20) * 6.4]), [])
  return <>
    <Box block={{ id: 'site', center: [0, -1.4, 0], size: [174, 2.6, 180] }} color="#223e49" />
    <Box block={{ id: 'court', center: [-23, 0.02, -16], size: [67, 0.08, 70] }} color="#244c46" />
    <Box block={{ id: 'road-e', center: [74, 0.04, 0], size: [18, 0.1, 184] }} color="#3a4c58" />
    <Box block={{ id: 'road-n', center: [0, 0.04, 81], size: [174, 0.1, 14] }} color="#3a4c58" />
    <Box block={{ id: 'path', center: [5, 0.08, -4], size: [4, 0.14, 120] }} color="#6c8181" />
    {[-64, -44, -24, -4, 16, 36, 56].map(z => <Box key={z} block={{ id: 'lane', center: [74, 0.11, z], size: [0.35, 0.04, 8] }} color="#a3b3ad" />)}
    {trees.map((point, i) => <mesh key={i} position={point} castShadow><icosahedronGeometry args={[1.8 + i % 3 * 0.3, 0]} /><meshStandardMaterial color={i % 2 ? '#3d7563' : '#345e55'} roughness={1} /></mesh>)}

    {labels && <Html position={[-29, 0.5, -9]} center zIndexRange={[10, 0]}><div className="court-label">我的小区<br /><span>中央庭院</span></div></Html>}
  </>
}
function PanelWindow({ site, snapshot }: { site: SiteSettings; snapshot: SolarSnapshot }) {
  const installation = getInstallation(site)
  return <group position={installation.world} rotation={[0, installation.yaw, 0]}>
    {windowBlocks.map(block => <Box key={block.id} block={block} color="#bac7c5" />)}
    <mesh position={[0, 0, 0.1]}><planeGeometry args={[4.1, 2.6]} /><meshStandardMaterial color="#76a6b5" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <Box block={{ id: 'panel', center: [0, 0, 0], size: [0.94, 2.06, 0.08] }} color="#102338" />
    {Array.from({ length: 5 }, (_, i) => <Line key={`v${i}`} points={[[-0.43 + i * 0.215, -0.98, 0.045], [-0.43 + i * 0.215, 0.98, 0.045]]} color="#559ea9" lineWidth={0.7} />)}
    {Array.from({ length: 9 }, (_, i) => <Line key={`h${i}`} points={[[-0.43, -0.98 + i * 0.245, 0.045], [0.43, -0.98 + i * 0.245, 0.045]]} color="#559ea9" lineWidth={0.7} />)}
    {snapshot.samples.map((lit, i) => <mesh key={i} position={[-0.43 + i % 8 / 7 * 0.86, -0.98 + Math.floor(i / 8) / 11 * 1.96, 0.06]}><sphereGeometry args={[0.016, 5, 5]} /><meshBasicMaterial color={lit ? '#8cebd2' : '#c36d59'} /></mesh>)}
  </group>
}
function Particles({ weather, kind, enabled, close, site }: { weather: WeatherSample; kind: WeatherKind; enabled: boolean; close: boolean; site: SiteSettings }) {
  const seeds = useMemo(() => Float32Array.from({ length: 900 * 3 }, (_, i) => ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1), [])
  const buffers = useMemo(() => ({ points: new Float32Array(900 * 3), streaks: new Float32Array(900 * 6) }), [])
  const pointAttribute = useRef<THREE.BufferAttribute>(null)
  const rainAttribute = useRef<THREE.BufferAttribute>(null)
  const rainGeometry = useRef<THREE.BufferGeometry>(null)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const falling = kind === 'rain' || kind === 'snow'
  const span = close ? 22 : 180
  const center = close ? getInstallation(site).world : [0, 60, 0]
  useEffect(() => {
    for (let i = 0; i < buffers.points.length; i++) buffers.points[i] = (seeds[i] - 0.5) * span
    if (pointAttribute.current) pointAttribute.current.needsUpdate = true
  }, [span, buffers, seeds])
  useFrame((_, delta) => {
    if (!enabled || (!falling && kind !== 'fog')) return
    const array = buffers.points
    const dt = reduced ? 0 : Math.min(delta, 0.05)
    const speed = kind === 'rain' ? 28 + Math.min(10, weather.precipitation * 2) : kind === 'snow' ? 2.5 : 0.2
    const wind = weather.windDirection * Math.PI / 180
    const windX = Math.sin(wind) * weather.windSpeed, windZ = Math.cos(wind) * weather.windSpeed
    for (let i = 0; i < array.length; i += 3) {
      array[i] -= windX * dt; array[i + 1] -= speed * dt; array[i + 2] -= windZ * dt
      for (let axis = 0; axis < 3; axis++) {
        if (array[i + axis] < -span / 2) array[i + axis] += span
        if (array[i + axis] > span / 2) array[i + axis] -= span
        buffers.streaks[i * 2 + axis] = array[i + axis]
      }
      const tail = close ? 0.012 : 0.045
      buffers.streaks[i * 2 + 3] = array[i] + windX * tail
      buffers.streaks[i * 2 + 4] = array[i + 1] + speed * tail
      buffers.streaks[i * 2 + 5] = array[i + 2] + windZ * tail
    }
    if (pointAttribute.current) pointAttribute.current.needsUpdate = true
    if (rainAttribute.current) rainAttribute.current.needsUpdate = true
    rainGeometry.current?.setDrawRange(0, Math.round(Math.min(900, 220 + weather.precipitation * 130)) * 2)
  })
  return <group position={center as Vec3}>
    <points visible={enabled && (kind === 'snow' || kind === 'fog')} frustumCulled={false}>
      <bufferGeometry><bufferAttribute ref={pointAttribute} attach="attributes-position" args={[buffers.points, 3]} /></bufferGeometry>
      <pointsMaterial color="#e3eff3" size={kind === 'snow' ? (close ? 0.045 : 0.42) : 2} transparent opacity={kind === 'fog' ? 0.09 : 0.8} depthWrite={false} sizeAttenuation />
    </points>
    <lineSegments visible={enabled && kind === 'rain'} frustumCulled={false}>
      <bufferGeometry ref={rainGeometry}><bufferAttribute ref={rainAttribute} attach="attributes-position" args={[buffers.streaks, 3]} /></bufferGeometry>
      <lineBasicMaterial color="#a2cfdf" transparent opacity={0.35} depthWrite={false} />
    </lineSegments>
  </group>
}
function WeatherClouds({ weather, daylight }: { weather: WeatherSample; daylight: boolean }) {
  const count = Math.round(weather.cloudCover / 12)
  return <group position={[0, 120, 0]}>{Array.from({ length: count }, (_, i) => <mesh key={i} position={[-85 + i * 24, Math.sin(i) * 5, 45 + Math.cos(i * 3) * 60]} scale={[23, 3.5, 12]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={daylight ? '#aabdc5' : '#354652'} transparent opacity={0.08 + weather.cloudCover / 650} depthWrite={false} /></mesh>)}</group>
}
function Scene({ snapshot, showRays, preset, site, particles, navigation }: Props & { navigation: NavigationRefs }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const blocks = useMemo(() => getBuildings(site), [site])
  const installation = getInstallation(site)
  const close = preset === 'room' || preset === 'panel'
  const sun = sunDirection(snapshot.altitude, snapshot.azimuth)
  const lightPosition = sun.map(v => v * 210) as Vec3
  const sunPosition = skySunPosition(snapshot.altitude, snapshot.azimuth, installation.world)
  const kind = weatherKind(snapshot.weather)
  const night = snapshot.altitude <= 0
  const background = night ? '#08151f' : kind === 'fog' ? '#5b737e' : kind === 'rain' || kind === 'snow' ? '#233c4c' : '#102d3e'
  return <>
    <color attach="background" args={[background]} />
    <fog attach="fog" args={[background, kind === 'fog' ? (close ? 10 : 120) : 310, kind === 'fog' ? (close ? 85 : 400) : 780]} />
    <ambientLight intensity={night ? 0.55 : 1.2} color="#b8d7e3" />
    <hemisphereLight args={['#d1e1ec', '#18382e', night ? 0.5 : 1.2]} />
    <directionalLight position={scenePoint(lightPosition)} intensity={night ? 0 : Math.min(3.3, snapshot.weather.dni / 260)} color="#ffe2af" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-150} shadow-camera-right={150} shadow-camera-top={160} shadow-camera-bottom={-150} shadow-camera-near={0.5} shadow-camera-far={500} shadow-bias={-0.0002} />
    <group scale={[1, 1, -1]}>
    <group rotation={[0, siteRotation(site), 0]}>
      <Landscape labels={!close} />
      {blocks.map(block => <Building key={block.id} block={block} detail />)}
    </group>
    <PanelWindow site={site} snapshot={snapshot} />
    {!close && <>
      <mesh position={installation.world}><octahedronGeometry args={[0.8]} /><meshBasicMaterial color="#77e6d2" /></mesh>
      <Line points={[installation.world, [installation.world[0] + 14, installation.world[1] + 8, installation.world[2]]]} color="#ffcb79" lineWidth={1.2} />
      <Html center position={[installation.world[0] + 14, installation.world[1] + 8, installation.world[2]]} zIndexRange={[30, 0]}><div className="home-label">我的公寓 <strong>{site.floor}F</strong><span>窗户朝向 {site.azimuth}°</span></div></Html>
    </>}
    {showRays && snapshot.altitude > 0 && <Line points={[installation.world, sunPosition]} color={snapshot.directSunlight ? '#ffce79' : '#94a6b0'} dashed dashSize={close ? 0.2 : 2} gapSize={close ? 0.12 : 1.4} lineWidth={1.4} />}
    <SkySun position={sunPosition} altitude={snapshot.altitude} />
    {!close && <WeatherClouds weather={snapshot.weather} daylight={!night} />}
    <Particles weather={snapshot.weather} kind={kind} enabled={particles} close={close} site={site} />
    </group>
    <SceneNavigationUpdater refs={navigation} sunPosition={scenePoint(sunPosition)} altitude={snapshot.altitude} />
    <CameraRig preset={preset} site={site} controls={controls} />
    <OrbitControls ref={controls} makeDefault enableRotate={preset !== 'north'} enableDamping dampingFactor={0.09} minDistance={2.5} maxDistance={440} maxPolarAngle={Math.PI / 2.01} />
  </>
}
export default function ApartmentScene(props: Props) {
  const navigation = useNavigationRefs()
  return <div className="apartment-renderer"><Canvas shadows dpr={[1, 1.5]} camera={{ fov: 50, near: 0.1, far: 1200, position: [200, 170, -125] }} gl={{ antialias: true }}><Scene {...props} navigation={navigation} /></Canvas><SceneNavigation refs={navigation} altitude={props.snapshot.altitude} azimuth={props.snapshot.azimuth} /></div>
}
