import * as SunCalc from 'suncalc'
import { apartmentConfig, panelConfig } from '../data/mockData.ts'
import { defaultSite, getInstallation, sampleExposure, type SiteSettings, type Vec3 } from './buildings.ts'
import { sampleWeather, scenarioWeather, shanghaiDate, type WeatherChoice, type WeatherData, type WeatherSample } from './weather.ts'

export type SolarSnapshot = {
  altitude: number; azimuth: number; incidenceAngle: number; geometricFactor: number
  exposureRatio: number; solarPotential: number; solarInputPower: number
  directSunlight: boolean; timeLabel: string; sunProgress: number; samples: boolean[]
  weather: WeatherSample; weatherSource: 'forecast' | 'scenario' | 'fallback'
  planeIrradiance: number; cellTemperature: number; temperatureFactor: number; clearSkyPower: number
}
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const rad = (degrees: number) => degrees * Math.PI / 180
export const formatTime = (date: Date) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: apartmentConfig.timezone }).format(date)
export const minutesFromDate = (date: Date) => { const [h, m] = formatTime(date).split(':').map(Number); return h * 60 + m }
export function buildDateAtMinutes(base: Date, minutes: number) {
  return new Date(new Date(`${shanghaiDate(base)}T00:00:00+08:00`).getTime() + minutes * 60_000)
}
export function getSunWindow(date: Date) {
  const times = SunCalc.getTimes(new Date(`${shanghaiDate(date)}T12:00:00+08:00`), apartmentConfig.latitude, apartmentConfig.longitude)
  const sunriseDate = times.sunrise ?? buildDateAtMinutes(date, 360)
  const sunsetDate = times.sunset ?? buildDateAtMinutes(date, 1110)
  return { times: { ...times, sunrise: sunriseDate, sunset: sunsetDate }, progress: clamp((date.getTime() - sunriseDate.getTime()) / Math.max(1, sunsetDate.getTime() - sunriseDate.getTime())) }
}
export function sunDirection(altitude: number, azimuth: number): Vec3 {
  return [Math.cos(rad(altitude)) * Math.sin(rad(azimuth)), Math.sin(rad(altitude)), Math.cos(rad(altitude)) * Math.cos(rad(azimuth))]
}
export function calculatePower(weather: WeatherSample, altitude: number, geometricFactor: number, exposure: number) {
  // Isotropic sky diffuse + ground reflection on a vertical plane. The API's DNI/DHI
  // already include clouds/precipitation: do not multiply by another cloud factor.
  const planeIrradiance = altitude > 0 ? Math.max(0, weather.dni * geometricFactor * exposure + weather.dhi * 0.5 + weather.ghi * 0.2 * 0.5) : 0
  const effective = planeIrradiance * panelConfig.glassTransmission
  // Approximate ventilated module temperature; window installation needs calibration.
  const cellTemperature = weather.temperature + effective / (25 + 6.84 * weather.windSpeed)
  const temperatureFactor = clamp(1 - 0.004 * (cellTemperature - 25), 0, 1.2)
  const solarInputPower = clamp(panelConfig.ratedPower * effective / 1000 * temperatureFactor * 0.92, 0, panelConfig.ratedPower)
  return { planeIrradiance, cellTemperature, temperatureFactor, solarInputPower }
}
export function getSolarSnapshot(date: Date, site: SiteSettings = defaultSite, weatherData?: WeatherData, choice: WeatherChoice = 'auto'): SolarSnapshot {
  const { altitude, azimuth } = SunCalc.getPosition(date, apartmentConfig.latitude, apartmentConfig.longitude)
  const direction = sunDirection(altitude, azimuth)
  const normal = sunDirection(0, getInstallation(site).azimuth)
  const dot = clamp(direction.reduce((sum, v, i) => sum + v * normal[i], 0), -1, 1)
  const geometricFactor = clamp(dot)
  const samples = sampleExposure(direction, site)
  const exposureRatio = samples.filter(Boolean).length / samples.length
  const forecast = choice === 'auto' ? sampleWeather(weatherData, date) : undefined
  const weather = forecast ?? scenarioWeather(choice === 'auto' ? 'clear' : choice, date, altitude)
  const power = calculatePower(weather, altitude, geometricFactor, exposureRatio)
  const clearSkyPower = calculatePower(scenarioWeather('clear', date, altitude), altitude, geometricFactor, exposureRatio).solarInputPower
  return { ...power, altitude, azimuth, incidenceAngle: Math.acos(dot) * 180 / Math.PI, geometricFactor, exposureRatio, samples, weather, weatherSource: forecast ? 'forecast' : choice === 'auto' ? 'fallback' : 'scenario', solarPotential: power.solarInputPower / panelConfig.ratedPower, directSunlight: altitude > 0 && geometricFactor > 0 && exposureRatio > 0 && weather.dni > 20, timeLabel: formatTime(date), sunProgress: getSunWindow(date).progress, clearSkyPower }
}
export function getPowerProfile(date: Date, site: SiteSettings, weatherData?: WeatherData, choice: WeatherChoice = 'auto') {
  const points = Array.from({ length: 49 }, (_, index) => {
    const minute = index * 30
    const snapshot = getSolarSnapshot(buildDateAtMinutes(date, minute), site, weatherData, choice)
    return { minute, power: snapshot.solarInputPower, source: snapshot.weatherSource }
  })
  const energy = points.slice(1).reduce((sum, p, i) => sum + (p.power + points[i].power) / 2 * 0.5, 0) / 1000
  return { points, energy, allForecast: points.every(p => p.source === 'forecast') }
}
export type PowerProfile = ReturnType<typeof getPowerProfile>
