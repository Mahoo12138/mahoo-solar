import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sunDirection } from '../lib/solar'
import type { Vec3 } from '../lib/buildings'

// A distant, scaled sky marker, independent of window geometry and camera presets.
export function skySunPosition(altitude: number, azimuth: number, origin: Vec3): Vec3 {
  const direction = sunDirection(altitude, azimuth)
  return origin.map((value, i) => value + direction[i] * 150) as Vec3
}
export function SkySun({ position, altitude }: { position: Vec3; altitude: number }) {
  return <group name="sky-sun" position={position} visible={altitude > 0}>
    <mesh><sphereGeometry args={[3.2, 24, 24]} /><meshBasicMaterial color="#fff2b4" fog={false} toneMapped={false} /></mesh>
    <mesh><sphereGeometry args={[5, 24, 24]} /><meshBasicMaterial color="#ffd177" transparent opacity={0.14} depthWrite={false} fog={false} toneMapped={false} /></mesh>
    <mesh><sphereGeometry args={[7.5, 24, 24]} /><meshBasicMaterial color="#ffc76c" transparent opacity={0.05} depthWrite={false} fog={false} toneMapped={false} /></mesh>
  </group>
}
const scratch = new THREE.Vector3()
const cameraPoint = new THREE.Vector3()
const cameraRight = new THREE.Vector3()
const cardinals = ['北', '东', '南', '西']
export function useNavigationRefs() {
  const compass = useRef<SVGSVGElement>(null)
  const needle = useRef<SVGGElement>(null)
  const labels = useRef<Array<SVGTextElement | null>>([])
  const sunLabel = useRef<HTMLDivElement>(null)
  const homeLabel = useRef<HTMLDivElement>(null)
  return useMemo(() => ({ compass, needle, labels, sunLabel, homeLabel }), [])
}
export type NavigationRefs = ReturnType<typeof useNavigationRefs>
export function SceneNavigationUpdater({ refs, sunPosition, homePosition, altitude }: { refs: NavigationRefs; sunPosition: Vec3; homePosition: Vec3; altitude: number }) {
  const { compass, needle, labels, sunLabel, homeLabel } = refs
  useFrame(({ camera, size }) => {
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0)
    const heading = Math.atan2(cameraRight.z, cameraRight.x)
    compass.current?.setAttribute('data-heading', (heading * 180 / Math.PI).toFixed(1))
    needle.current?.setAttribute('transform', `rotate(${-heading * 180 / Math.PI} 44 44)`)
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 - heading
      labels.current[i]?.setAttribute('x', String(44 + Math.sin(angle) * 31))
      labels.current[i]?.setAttribute('y', String(44 - Math.cos(angle) * 31))
    }
    if (homeLabel.current) {
      scratch.set(...homePosition).project(camera)
      const homeX = (scratch.x + 1) * size.width / 2
      const homeY = (1 - scratch.y) * size.height / 2
      const x = Math.max(88, Math.min(size.width - 88, homeX + 72))
      const y = Math.max(72, Math.min(size.height - 72, homeY - 8))
      homeLabel.current.style.left = `${x}px`
      homeLabel.current.style.top = `${y}px`
    }
    const label = sunLabel.current
    if (!label) return
    scratch.set(...sunPosition)
    cameraPoint.copy(scratch).applyMatrix4(camera.matrixWorldInverse)
    scratch.project(camera)
    const inView = cameraPoint.z < 0 && Math.abs(scratch.x) < 0.9 && Math.abs(scratch.y) < 0.9
    let x = (scratch.x + 1) * size.width / 2
    let y = (1 - scratch.y) * size.height / 2 + 25
    if (cameraPoint.z >= 0) {
      // Direction remains meaningful even when the sun is behind the camera.
      x = cameraPoint.x >= 0 ? size.width - 85 : 85
      y = cameraPoint.y >= 0 ? 100 : size.height - 190
    }
    x = Math.max(85, Math.min(size.width - 85, x))
    y = Math.max(105, Math.min(size.height - 190, y))
    if (!inView) y = 112
    if (altitude <= 0) { x = size.width / 2; y = 112 }
    label.style.left = `${x}px`; label.style.top = `${y}px`
    label.dataset.visibility = altitude <= 0 ? 'night' : inView ? 'visible' : 'offscreen'
    label.textContent = altitude <= 0 ? '太阳在地平线下' : `${inView ? '太阳' : '☀ 太阳在视野外'} · ${Math.round(altitude)}°`
  })
  return null
}
export function SceneNavigation({ refs, altitude, azimuth, floor }: { refs: NavigationRefs; altitude: number; azimuth: number; floor: number }) {
  const { compass, needle, labels, sunLabel, homeLabel } = refs
  return <div className="scene-navigation">
    <div className="scene-compass" aria-label="场景指南针">
      <svg ref={compass} viewBox="0 0 88 88" role="img" aria-label="随相机旋转的东南西北指南针">
        <circle cx="44" cy="44" r="42" fill="#0b1b28dc" stroke="#557480" strokeWidth="0.8" />
        <circle cx="44" cy="44" r="22" fill="none" stroke="#496472" strokeWidth="0.6" />
        <g ref={needle}><path d="M44 21L50 44L44 40L38 44Z" fill="#f4c773" /><path d="M44 67L38 44L44 48L50 44Z" fill="#74929c" /></g>
        <circle cx="44" cy="44" r="2.5" fill="#c1dadc" />
        {cardinals.map((label, i) => <text key={label} ref={node => { labels.current[i] = node }} x="44" y="13" textAnchor="middle" dominantBaseline="central" fill={i === 0 ? '#f4c773' : '#b0c8d1'} fontSize="10">{label}</text>)}
      </svg><span>指南针</span>
    </div>
    <div ref={homeLabel} className="home-label scene-home-label" aria-label="我的公寓位置">我的公寓 <strong>{floor}F</strong><span>窗户朝向 {azimuth}°</span></div>
    <div ref={sunLabel} className="sky-sun-label" aria-label="太阳位置" title={`太阳方位 ${Math.round(azimuth)}°，高度 ${Math.round(altitude)}°；按场景比例示意`} />
  </div>
}
