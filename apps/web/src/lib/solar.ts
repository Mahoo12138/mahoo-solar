import * as SunCalc from 'suncalc'
import { apartmentConfig, mockPowerProfile, panelConfig } from '../data/mockData'

export type SolarSnapshot = {
  altitude: number
  azimuth: number
  incidenceAngle: number
  geometricFactor: number
  exposureRatio: number
  solarPotential: number
  solarInputPower: number
  batteryLevel: number
  outputPower: number
  directSunlight: boolean
  timeLabel: string
  sunProgress: number
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const rad = (degrees: number) => (degrees * Math.PI) / 180

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: apartmentConfig.timezone,
  }).format(date)

export function getSunWindow(date: Date) {
  const times = SunCalc.getTimes(date, apartmentConfig.latitude, apartmentConfig.longitude)
  const sunriseDate = times.sunrise ?? buildDateAtMinutes(date, 360)
  const sunsetDate = times.sunset ?? buildDateAtMinutes(date, 1110)
  const sunrise = sunriseDate.getTime()
  const sunset = sunsetDate.getTime()
  const progress = clamp((date.getTime() - sunrise) / Math.max(1, sunset - sunrise))
  return { times: { ...times, sunrise: sunriseDate, sunset: sunsetDate }, progress }
}

export function getSolarSnapshot(date: Date): SolarSnapshot {
  const position = SunCalc.getPosition(date, apartmentConfig.latitude, apartmentConfig.longitude)
  // suncalc 2.x returns degrees for both values (older versions returned radians).
  const altitude = Math.max(-8, position.altitude)
  const azimuth = (position.azimuth + 360) % 360
  const sunAltitude = rad(altitude)
  const sunAzimuth = rad(azimuth)

  const sunVector = {
    x: Math.cos(sunAltitude) * Math.sin(sunAzimuth),
    y: Math.sin(sunAltitude),
    z: Math.cos(sunAltitude) * Math.cos(sunAzimuth),
  }
  // For a vertical panel, tilt=90° means the normal is horizontal and points to azimuth.
  const tilt = rad(panelConfig.tilt)
  const panelNormal = {
    x: Math.sin(tilt) * Math.sin(rad(panelConfig.azimuth)),
    y: Math.cos(tilt),
    z: Math.sin(tilt) * Math.cos(rad(panelConfig.azimuth)),
  }
  const dot = clamp(sunVector.x * panelNormal.x + sunVector.y * panelNormal.y + sunVector.z * panelNormal.z, -1, 1)
  const geometricFactor = clamp(dot)
  const incidenceAngle = Math.acos(dot) * (180 / Math.PI)
  const { progress } = getSunWindow(date)
  const usableHours = Math.sin(Math.PI * progress)
  const facadeAlignment = clamp(0.24 + Math.cos(rad(azimuth - panelConfig.azimuth)) * 0.52)
  const exposureRatio = clamp(0.68 + usableHours * 0.18 - Math.max(0, altitude - 55) * 0.0025)
  const solarPotential = clamp(geometricFactor * exposureRatio * panelConfig.glassTransmission)
  const daylight = altitude > 0
  const solarInputPower = daylight
    ? Math.round(Math.min(panelConfig.ratedPower, panelConfig.ratedPower * (solarPotential * 0.94 + facadeAlignment * 0.05) + 9))
    : 0
  const outputPower = Math.round(6.55 + (solarInputPower > 30 ? 9.63 : 4.2))
  const batteryLevel = Math.round(clamp(0.56 + progress * 0.2 + solarPotential * 0.13, 0.12, 0.96) * 100)

  return {
    altitude,
    azimuth,
    incidenceAngle,
    geometricFactor,
    exposureRatio,
    solarPotential,
    solarInputPower,
    batteryLevel,
    outputPower,
    directSunlight: daylight && solarInputPower > 12,
    timeLabel: formatTime(date),
    sunProgress: progress,
  }
}

export function buildDateAtMinutes(base: Date, minutes: number) {
  const date = new Date(base)
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return date
}

export function chartPath(width: number, height: number) {
  const points = mockPowerProfile.map((item, index) => {
    const x = (index / (mockPowerProfile.length - 1)) * width
    const y = height - (item.value / panelConfig.ratedPower) * height
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  })
  return points.join(' ')
}
