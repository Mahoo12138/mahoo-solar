import { useEffect, useState } from 'react'
import { apartmentConfig } from '../data/mockData.ts'
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog'
export type WeatherChoice = 'auto' | WeatherKind
export type WeatherSample = {
  time: number; temperature: number; cloudCover: number; precipitation: number; snowfall: number
  windSpeed: number; windDirection: number; code: number; ghi: number; dni: number; dhi: number
}
export type WeatherData = { samples: WeatherSample[]; fetchedAt: number }
export type WeatherState = { data?: WeatherData; status: 'loading' | 'ready' | 'error' | 'disabled'; error?: string }
export const weatherNames: Record<WeatherKind, string> = { clear: '晴朗', cloudy: '多云 / 阴', rain: '降雨', snow: '降雪', fog: '雾' }
export function weatherKind(sample: WeatherSample): WeatherKind {
  if ([71, 73, 75, 77, 85, 86].includes(sample.code) || sample.snowfall > 0) return 'snow'
  if (sample.code >= 51 || sample.precipitation > 0) return 'rain'
  if ([45, 48].includes(sample.code)) return 'fog'
  return sample.cloudCover >= 30 ? 'cloudy' : 'clear'
}
export function shanghaiDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: apartmentConfig.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
const fields = ['temperature_2m', 'cloud_cover', 'precipitation', 'snowfall', 'wind_speed_10m', 'wind_direction_10m', 'weather_code', 'shortwave_radiation_instant', 'direct_normal_irradiance_instant', 'diffuse_radiation_instant'] as const
export function parseWeather(body: unknown): WeatherSample[] {
  const hourly = (body as { hourly?: Record<string, unknown> })?.hourly
  if (!hourly || !Array.isArray(hourly.time)) throw new Error('天气响应缺少逐小时数据')
  const times = hourly.time
  if (!fields.every(k => Array.isArray(hourly[k]) && hourly[k].length === times.length)) throw new Error('天气响应字段不完整')
  const samples: WeatherSample[] = []
  times.forEach((time, index) => {
    const values = fields.map(k => (hourly[k] as unknown[])[index])
    if (typeof time !== 'number' || !Number.isFinite(time) || !values.every(v => typeof v === 'number' && Number.isFinite(v))) return
    const [temperature, cloudCover, precipitation, snowfall, windSpeed, windDirection, code, ghi, dni, dhi] = values as number[]
    samples.push({ time: time * 1000, temperature, cloudCover, precipitation, snowfall, windSpeed, windDirection, code, ghi: Math.max(0, ghi), dni: Math.max(0, dni), dhi: Math.max(0, dhi) })
  })
  if (!samples.length) throw new Error('天气接口暂无有效辐照数据')
  return samples.sort((a, b) => a.time - b.time)
}
const cache = new Map<string, WeatherData>()
export function isWeatherDateEnabled(day: string, now: Date) { return day === shanghaiDate(now) }
export function useWeather(day: string, refresh: number, enabled = true): WeatherState {
  const [state, setState] = useState<WeatherState & { day: string }>({ day, status: 'loading' })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let disposed = false
    const fetchWeather = async () => {
      const cached = cache.get(day)
      if (cached && Date.now() - cached.fetchedAt < 600_000 && refresh === 0) {
        setState({ day, status: 'ready', data: cached }); return
      }
      setState({ day, status: 'loading' })
      const nextDay = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
      const params = new URLSearchParams({ latitude: String(apartmentConfig.latitude), longitude: String(apartmentConfig.longitude), hourly: fields.join(','), timezone: apartmentConfig.timezone, timeformat: 'unixtime', wind_speed_unit: 'ms', start_date: day, end_date: nextDay })
      const timeout = window.setTimeout(() => controller.abort(), 12_000)
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`天气服务 HTTP ${response.status}（日期可能超出预报范围）`)
        const data = { samples: parseWeather(await response.json()), fetchedAt: Date.now() }
        cache.set(day, data)
        if (!disposed) setState({ day, status: 'ready', data })
      } catch (error) {
        if (!disposed) setState({ day, status: 'error', error: error instanceof Error && error.name !== 'AbortError' ? error.message : '天气请求超时，请重试' })
      } finally { window.clearTimeout(timeout) }
    }
    void fetchWeather()
    return () => { disposed = true; controller.abort() }
  }, [day, refresh, enabled])
  if (!enabled) return { status: 'disabled' }
  return state.day === day ? state : { status: 'loading' }
}
export function sampleWeather(data: WeatherData | undefined, date: Date): WeatherSample | undefined {
  if (!data) return
  // No extrapolation: another date or a missing hour must not silently reuse current weather.
  const time = date.getTime()
  const a = data.samples.find(s => s.time <= time && time - s.time < 3_600_000)
  if (!a) return
  const b = data.samples.find(s => s.time === a.time + 3_600_000)
  if (!b) return time === a.time ? a : undefined
  const t = (time - a.time) / 3_600_000
  const mix = (key: 'temperature' | 'ghi' | 'dni' | 'dhi') => a[key] + (b[key] - a[key]) * t
  return { ...a, time, temperature: mix('temperature'), ghi: mix('ghi'), dni: mix('dni'), dhi: mix('dhi') }
}
export function scenarioWeather(kind: WeatherKind, date: Date, altitude: number): WeatherSample {
  const sin = Math.max(0, Math.sin(altitude * Math.PI / 180))
  const factors = { clear: [0.88, 0.1, 8, 29, 0], cloudy: [0.22, 0.25, 85, 24, 0], rain: [0.035, 0.13, 98, 20, 4], snow: [0.025, 0.16, 100, -2, 1], fog: [0.015, 0.12, 100, 16, 0] }[kind]
  const [direct, diffuse, cloudCover, temperature, precipitation] = factors
  const dni = sin > 0 ? 950 * direct * Math.pow(sin, 0.18) : 0
  const dhi = 950 * diffuse * sin
  return { time: date.getTime(), temperature, cloudCover, precipitation, snowfall: kind === 'snow' ? 0.3 : 0, windSpeed: kind === 'rain' ? 5 : 2, windDirection: 45, code: { clear: 0, cloudy: 3, rain: 63, snow: 73, fog: 45 }[kind], ghi: dni * sin + dhi, dni, dhi }
}
