// Schematic traced from the labelled map: final north-up reference: C1 northwest, C2 northeast, C3 south.
// Dimensions/heights are editable estimates, not a survey. World: +X east, +Z north.
export type Vec3 = [number, number, number]
export type SiteSettings = { floor: number; floors: number; azimuth: number }
export const defaultSite: SiteSettings = { floor: 11, floors: 20, azimuth: 105 }
export const floorHeight = 3
export const siteRotation = (site: SiteSettings) => (site.azimuth - 90) * Math.PI / 180
export type Block = { id: string; center: Vec3; size: Vec3 }
export function getBuildings(settings: SiteSettings): Block[] {
  const height = settings.floors * floorHeight
  return [
    { id: 'C1', center: [-38, 31.5, 40], size: [30, 63, 16] },
    { id: 'C1-wing', center: [-45, 31.5, 22], size: [16, 63, 20] },
    { id: 'C2', center: [30, height / 2, 26], size: [26, height, 20] },
    { id: 'C2-wing', center: [17, height / 2, 44], size: [52, height, 16] },
    { id: 'C3', center: [29, 48, -44], size: [26, 96, 42] },
    { id: 'B2', center: [18, 3, 32], size: [56, 6, 50] },
  ]
}
export function rotateY([x, y, z]: Vec3, angle: number): Vec3 {
  return [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)]
}
export function getInstallation(site: SiteSettings) {
  // Red marker in the user's final north-up map: lower end of C2's east facade.
  const local: Vec3 = [43.12, (site.floor - 1) * floorHeight + 1.54, 20]
  return { local, world: rotateY(local, siteRotation(site)), azimuth: site.azimuth, yaw: site.azimuth * Math.PI / 180 }
}
// Shared by the window drawing and the 96 panel ray samples. Coordinates relative to panel center.
export const windowBlocks: Block[] = [
  { id: 'left', center: [-2.16, 0, 0.1], size: [0.3, 3, 0.42] },
  { id: 'right', center: [2.16, 0, 0.1], size: [0.3, 3, 0.42] },
  { id: 'top', center: [0, 1.48, 0.22], size: [4.6, 0.28, 0.9] },
  { id: 'bottom', center: [0, -1.38, 0.22], size: [4.6, 0.28, 0.9] },
  { id: 'mullion', center: [0, -0.11, 0.19], size: [4.18, 0.12, 0.12] },
  { id: 'rail', center: [0, -0.64, 0.65], size: [4.48, 0.055, 0.055] },
  ...[-1.03, 1.03].map((x): Block => ({ id: `frame${x}`, center: [x, 0, 0.19], size: [0.11, 2.7, 0.12] })),
]
export function rayHitsBox(origin: Vec3, direction: Vec3, block: Block) {
  let near = 0.001
  let far = Infinity
  for (let axis = 0; axis < 3; axis++) {
    const min = block.center[axis] - block.size[axis] / 2
    const max = block.center[axis] + block.size[axis] / 2
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < min || origin[axis] > max) return false
    } else {
      const a = (min - origin[axis]) / direction[axis]
      const b = (max - origin[axis]) / direction[axis]
      near = Math.max(near, Math.min(a, b))
      far = Math.min(far, Math.max(a, b))
      if (far < near) return false
    }
  }
  return far >= near
}
export function sampleExposure(direction: Vec3, site: SiteSettings): boolean[] {
  const installation = getInstallation(site)
  const localDirection = rotateY(direction, -siteRotation(site))
  const windowDirection = rotateY(direction, -installation.yaw)
  const blocks = getBuildings(site)
  return Array.from({ length: 96 }, (_, i) => {
    if (direction[1] <= 0 || windowDirection[2] <= 0) return false
    const point: Vec3 = [-0.43 + (i % 8) / 7 * 0.86, -0.98 + Math.floor(i / 8) / 11 * 1.96, 0.06]
    if (windowBlocks.some(b => rayHitsBox(point, windowDirection, b))) return false
    const offset = rotateY(point, installation.yaw - siteRotation(site))
    const origin = installation.local.map((v, j) => v + offset[j]) as Vec3
    return !blocks.some(b => rayHitsBox(origin, localDirection, b))
  })
}
