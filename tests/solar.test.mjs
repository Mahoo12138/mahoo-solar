import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultSite, getBuildings, getInstallation, rayHitsBox, rotateY, sampleExposure, siteRotation } from '../apps/web/src/lib/buildings.ts'
import { buildDateAtMinutes, calculatePower, getPowerProfile, getSolarSnapshot, sunDirection } from '../apps/web/src/lib/solar.ts'
import { parseWeather, sampleWeather, scenarioWeather, shanghaiDate, weatherKind } from '../apps/web/src/lib/weather.ts'
const morning = new Date('2026-09-09T10:00:00+08:00')

test('north-up reference: C1 west of C2, C3 south, supplied heights and marker on east facade', () => {
  const blocks = getBuildings(defaultSite)
  const get = id => blocks.find(b => b.id === id)
  assert.equal(get('C1').size[1], 63)
  assert.equal(get('C2').size[1], 60)
  assert.equal(get('C3').size[1], 96)
  assert.ok(get('C1').center[0] < get('C2').center[0])
  assert.ok(get('C3').center[2] < get('C2').center[2])
  const installation = getInstallation(defaultSite)
  assert.ok(installation.local[0] > get('C2').center[0] + get('C2').size[0] / 2)
  assert.equal(installation.local[1], 31.54)
  assert.equal(installation.azimuth, 105)
})
test('ray-box intersection handles parallel rays, misses and boxes behind sun direction', () => {
  const block = { center: [0, 2, 0], size: [2, 2, 2] }
  assert.equal(rayHitsBox([0, 0, 0], [0, 1, 0], block), true)
  assert.equal(rayHitsBox([2, 0, 0], [0, 1, 0], block), false)
  assert.equal(rayHitsBox([0, 4, 0], [0, 1, 0], block), false)
})
test('C3 intersects the southwest sightline; east-facing panel rejects this back-facing direction', () => {
  const site = defaultSite
  const origin = getInstallation(site).local
  const c3 = getBuildings(site).find(b => b.id === 'C3')
  const towardC3 = [c3.center[0] - origin[0], 20, c3.center[2] - origin[2]]
  assert.equal(rayHitsBox(origin, towardC3, c3), true)
  const direction = rotateY(towardC3, siteRotation(site))
  assert.equal(sampleExposure(direction, site).filter(Boolean).length, 0)
})
test('weather scenarios change both power and integrated daily energy', () => {
  const sunny = getSolarSnapshot(morning, defaultSite, undefined, 'clear')
  const rain = getSolarSnapshot(morning, defaultSite, undefined, 'rain')
  assert.ok(sunny.solarInputPower > rain.solarInputPower * 2)
  assert.equal(sunny.weatherSource, 'scenario')
  assert.ok(getPowerProfile(morning, defaultSite, undefined, 'clear').energy > getPowerProfile(morning, defaultSite, undefined, 'rain').energy)
})
test('night and back-facing panels have no direct exposure; zero irradiance gives zero watts', () => {
  const night = getSolarSnapshot(new Date('2026-09-09T00:00:00+08:00'), defaultSite, undefined, 'rain')
  assert.equal(night.solarInputPower, 0)
  assert.equal(night.exposureRatio, 0)
  assert.equal(night.directSunlight, false)
  assert.equal(sampleExposure(sunDirection(30, 285), defaultSite).filter(Boolean).length, 0)
  const weather = { ...scenarioWeather('clear', morning, 45), dni: 0, dhi: 0, ghi: 0 }
  assert.equal(calculatePower(weather, 45, 1, 1).solarInputPower, 0)
})
test('geometry affects power, shaded panels keep diffuse radiation, and heat lowers power', () => {
  const weather = scenarioWeather('clear', morning, 45)
  const exposed = calculatePower(weather, 45, 1, 1)
  const shaded = calculatePower(weather, 45, 1, 0)
  assert.ok(exposed.solarInputPower > shaded.solarInputPower)
  assert.ok(shaded.solarInputPower > 0)
  assert.ok(calculatePower({ ...weather, temperature: 45 }, 45, 1, 1).solarInputPower < exposed.solarInputPower)
  assert.ok(getSolarSnapshot(morning, { ...defaultSite, floor: 1 }, undefined, 'clear').solarInputPower < getSolarSnapshot(morning, defaultSite, undefined, 'clear').solarInputPower)
})
test('forecast radiation is used directly without duplicate cloud attenuation', () => {
  const a = scenarioWeather('clear', morning, 45)
  const data = { samples: [a, { ...a, time: a.time + 3600000 }], fetchedAt: morning.getTime() }
  const forecast = getSolarSnapshot(morning, defaultSite, data)
  const cloudy = getSolarSnapshot(morning, defaultSite, { ...data, samples: data.samples.map(s => ({ ...s, cloudCover: 100 })) })
  assert.equal(forecast.weatherSource, 'forecast')
  assert.equal(forecast.solarInputPower, cloudy.solarInputPower)
})
test('missing hours do not reuse stale forecasts and interpolate valid adjacent hours', () => {
  const a = scenarioWeather('clear', morning, 45)
  const b = { ...a, time: a.time + 3600000, dni: a.dni / 2 }
  const data = { samples: [a, b], fetchedAt: morning.getTime() }
  assert.equal(sampleWeather(data, new Date(a.time + 1800000)).dni, a.dni * 0.75)
  assert.equal(sampleWeather(data, new Date(a.time - 1)), undefined)
  assert.equal(sampleWeather(data, new Date(b.time + 1800000)), undefined)
  assert.equal(getSolarSnapshot(new Date('2027-09-09T10:00:00+08:00'), defaultSite, data).weatherSource, 'fallback')
})
test('invalid API payloads and null radiation are rejected, snow and fog map correctly', () => {
  assert.throws(() => parseWeather(null))
  assert.throws(() => parseWeather({ hourly: { time: [1] } }))
  const keys = ['temperature_2m','cloud_cover','precipitation','snowfall','wind_speed_10m','wind_direction_10m','weather_code','shortwave_radiation_instant','direct_normal_irradiance_instant','diffuse_radiation_instant']
  const hourly = Object.fromEntries(keys.map(k => [k, [0]])); hourly.time = [100]
  assert.equal(parseWeather({ hourly })[0].time, 100000)
  hourly.direct_normal_irradiance_instant = [null]
  assert.throws(() => parseWeather({ hourly }))
  assert.equal(weatherKind(scenarioWeather('snow', morning, 45)), 'snow')
  assert.equal(weatherKind(scenarioWeather('fog', morning, 45)), 'fog')
})
test('all simulated times use Shanghai date independent of browser/system timezone', () => {
  const date = new Date('2026-09-09T18:00:00Z')
  assert.equal(shanghaiDate(date), '2026-09-10')
  assert.equal(buildDateAtMinutes(date, 600).toISOString(), '2026-09-10T02:00:00.000Z')
})

test('weather API eligibility follows Shanghai midnight and excludes past/future dates', async () => {
  const { isWeatherDateEnabled } = await import('../apps/web/src/lib/weather.ts')
  const beforeMidnight = new Date('2026-09-09T15:59:59Z')
  const afterMidnight = new Date('2026-09-09T16:00:00Z')
  assert.equal(isWeatherDateEnabled('2026-09-09', beforeMidnight), true)
  assert.equal(isWeatherDateEnabled('2026-09-09', afterMidnight), false)
  assert.equal(isWeatherDateEnabled('2026-09-10', afterMidnight), true)
  assert.equal(isWeatherDateEnabled('2026-09-11', afterMidnight), false)
})
