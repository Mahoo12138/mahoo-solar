import { useEffect, useMemo, useState } from 'react'
import { Activity, BatteryCharging, Camera, CloudSun, Gauge, HousePlug, Layers3, MapPin, Play, RotateCcw, SolarPanel, Sun, SunMedium, Waves, Wind, Zap } from 'lucide-react'
import { batteryConfig, mockBatteryTelemetry, panelConfig } from './data/mockData'
import ApartmentScene, { type SceneCameraPreset } from './scenes/ApartmentScene'
import { defaultSite, type SiteSettings } from './lib/buildings'
import { buildDateAtMinutes, getPowerProfile, getSolarSnapshot, getSunWindow, minutesFromDate, type PowerProfile, type SolarSnapshot } from './lib/solar'
import { shanghaiDate, isWeatherDateEnabled, useWeather, weatherKind, weatherNames, type WeatherChoice, type WeatherState } from './lib/weather'

type Mode = 'live' | 'simulation'
const cn = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ')
const pct = (value: number) => `${Math.round(value * 100)}%`
const degrees = (value: number) => `${Math.round(value)}°`
const cameraNames = { overview: '小区全景', north: '北向俯视', room: '我的窗户', panel: '光伏板' }

function App() {
  const [mode, setMode] = useState<Mode>('live')
  const [liveNow, setLiveNow] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => shanghaiDate(new Date()))
  const [simMinutes, setSimMinutes] = useState(() => minutesFromDate(new Date()))
  const [showRays, setShowRays] = useState(true)
  const [particles, setParticles] = useState(true)
  const [cameraPreset, setCameraPreset] = useState<SceneCameraPreset>('overview')
  const [site, setSite] = useState<SiteSettings>(defaultSite)
  const [weatherChoice, setWeatherChoice] = useState<WeatherChoice>('auto')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const clock = window.setInterval(() => setLiveNow(new Date()), 10_000)
    const weatherTimer = window.setInterval(() => setRefresh(value => value + 1), 600_000)
    return () => { window.clearInterval(clock); window.clearInterval(weatherTimer) }
  }, [])
  const activeDate = useMemo(() => mode === 'live' ? liveNow : buildDateAtMinutes(new Date(`${selectedDate}T12:00:00+08:00`), simMinutes), [mode, liveNow, selectedDate, simMinutes])
  const day = shanghaiDate(activeDate)
  const isToday = isWeatherDateEnabled(day, liveNow)
  const weatherState = useWeather(day, refresh, isToday)
  const effectiveWeatherChoice = !isToday && weatherChoice === 'auto' ? 'clear' : weatherChoice
  const snapshot = useMemo(() => getSolarSnapshot(activeDate, site, weatherState.data, effectiveWeatherChoice), [activeDate, site, weatherState.data, effectiveWeatherChoice])
  const profile = useMemo(() => getPowerProfile(new Date(`${day}T12:00:00+08:00`), site, weatherState.data, effectiveWeatherChoice), [day, site, weatherState.data, effectiveWeatherChoice])
  const sunWindow = useMemo(() => getSunWindow(activeDate), [activeDate])
  const selectMode = (next: Mode) => {
    if (next === 'simulation' && mode === 'live') { setSelectedDate(shanghaiDate(liveNow)); setSimMinutes(minutesFromDate(liveNow)) }
    setMode(next)
  }
  const resetLive = () => { const now = new Date(); setLiveNow(now); setSelectedDate(shanghaiDate(now)); setWeatherChoice('auto'); setMode('live') }
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><SunMedium size={17} /></div><div><div className="brand-name"><span>SOLAR</span> APARTMENT</div><div className="brand-subtitle">PERSONAL ENERGY TWIN / 01</div></div></div>
      <div className="topbar-location"><MapPin size={14} />我的小区</div>
      <div className="topbar-actions"><div className="data-source"><span className="status-dot" />{mode === 'live' ? '实时估算' : '时段模拟'}</div><div className="topbar-time"><strong>{snapshot.timeLabel}</strong><label className="date-picker"><span>DATE</span><input aria-label="选择日期" type="date" value={day} onChange={event => { if (event.target.value) { setSelectedDate(event.target.value); setMode('simulation') } }} /></label></div><button className="icon-button" title="恢复实时模式" aria-label="恢复实时模式" onClick={resetLive}><RotateCcw size={15} /></button></div>
    </header>
    <main className="workspace">
      <BatteryPanel />
      <section className="scene-panel">
        <div className="scene-toolbar"><div><span className="scene-kicker">NEIGHBORHOOD / SOLAR DIGITAL TWIN</span><h1>我的公寓 · 光与天气</h1></div><div className="scene-meta"><span className="scene-live-dot" />{snapshot.directSunlight ? '直射阳光' : snapshot.altitude <= 0 ? '夜间' : '散射光'}<span className="scene-meta-divider" />{weatherNames[weatherKind(snapshot.weather)]}</div></div>
        <div className="scene-canvas three-scene-canvas" aria-label="公寓楼栋三维模型">
          <ApartmentScene snapshot={snapshot} showRays={showRays} preset={cameraPreset} site={site} particles={particles} />
          <div className="scene-overlay"><div className="scene-orientation"><span className="axis-east">{cameraPreset === 'north' ? '北 ↑ · 东 →' : '拖动旋转 · 滚轮缩放'}</span></div><div className="camera-presets"><span className="camera-label"><Camera size={12} /></span>{(Object.keys(cameraNames) as SceneCameraPreset[]).map(item => <button key={item} aria-pressed={cameraPreset === item} className={cn(cameraPreset === item && 'active')} onClick={() => setCameraPreset(item)}>{cameraNames[item]}</button>)}</div></div>
          <div className="scene-bottom-label"><span>太阳高度 <strong>{degrees(snapshot.altitude)}</strong></span><span>入射角 <strong>{degrees(snapshot.incidenceAngle)}</strong></span><span>直射面积 <strong>{pct(snapshot.exposureRatio)}</strong></span></div>
        </div>
        <div className="site-settings">
          <div className="site-summary"><Layers3 size={14} /><span>我的小区</span><span className="site-reference">按北向地图建模</span></div>
          <div className="site-fields"><label>我的楼层<select aria-label="我的楼层" value={site.floor} onChange={event => setSite({ ...site, floor: Number(event.target.value) })}>{Array.from({ length: site.floors }, (_, i) => <option key={i} value={i + 1}>{i + 1} F</option>)}</select></label><label>窗户朝向<input aria-label="窗户方位角" type="range" min="75" max="125" value={site.azimuth} onChange={event => setSite({ ...site, azimuth: Number(event.target.value) })} /><strong>{site.azimuth}°</strong></label><button onClick={() => setSite(defaultSite)} title="重置楼层和朝向"><RotateCcw size={12} />重置</button></div>
          <p>楼层与窗户朝向可校准；建筑平面尺寸为示意估算。</p>
        </div>
      </section>
      <aside className="side-panel telemetry-panel">
        <div className="panel-header"><div className="panel-icon"><Activity size={16} /></div><div><div className="panel-eyebrow">WEATHER-AWARE ENERGY</div><h2>光伏功率估算</h2></div></div>
        <WeatherPanel snapshot={snapshot} state={weatherState} choice={effectiveWeatherChoice} setChoice={setWeatherChoice} onRefresh={() => setRefresh(value => value + 1)} />
        <div className="power-hero"><div className="metric-label"><Zap size={14} />预测功率</div><div className="power-value" data-testid="solar-power">{snapshot.solarInputPower.toFixed(1)}<span>W</span></div><MetricBar value={snapshot.solarInputPower / panelConfig.ratedPower} accent="cyan" /><div className="metric-range"><span>晴空参考 {snapshot.clearSkyPower.toFixed(1)} W</span><span>额定 {panelConfig.ratedPower} W</span></div></div>
        <div className="compact-metrics"><TelemetryMetric icon={<Sun size={14} />} label="板面辐照" value={`${Math.round(snapshot.planeIrradiance)}`} unit="W/m²" /><TelemetryMetric icon={<Gauge size={14} />} label="直射面积" value={pct(snapshot.exposureRatio)} unit="96 点遮挡采样" /></div>
        <div className="calculation-note"><span>估算板温 <b>{snapshot.cellTemperature.toFixed(1)}°C</b></span><span>温度系数 <b>{snapshot.temperatureFactor.toFixed(2)}×</b></span></div>
        <div className="chart-section"><div className="chart-header"><div><div className="subsection-label">{day} / 24H</div><h3>当天发电估算</h3></div><div className="chart-total" data-testid="daily-energy">{profile.energy.toFixed(2)} <span>kWh</span></div></div><PowerChart profile={profile} minute={minutesFromDate(activeDate)} snapshot={snapshot} /><p className="chart-note">{!isToday ? '非当前日期 · 全天采用模拟天气' : effectiveWeatherChoice !== 'auto' ? '全天采用所选模拟天气' : profile.allForecast ? '逐小时预报 · 半小时积分' : '缺失时段采用晴空回退，非完整天气预报'}</p></div>
        <details className="model-details"><summary>计算依据与数据来源</summary><p>直射辐照 × 入射余弦 × 未遮挡面积，加天空散射与地面反射，再乘玻璃透过率 80%、温度修正与系统效率 92%。云雨影响已包含在接口辐照中，不重复扣减。</p><p>楼栋与窗框使用同一几何模型；散射采用各向同性天空近似。板温使用气温与风速近似，未模拟积雪覆盖、室内热环境或串联失配。功率是模型估算，未连接设备。</p><p><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo · CC BY 4.0</a> · 天气仅用于当前日期，时间为北京时间。</p></details>
        <div className="telemetry-footer"><button className={cn('ray-toggle', showRays && 'active')} aria-pressed={showRays} onClick={() => setShowRays(!showRays)}><Waves size={13} />光线 {showRays ? 'ON' : 'OFF'}</button><button className={cn('ray-toggle', particles && 'active')} aria-pressed={particles} onClick={() => setParticles(!particles)}><Wind size={13} />天气粒子 {particles ? 'ON' : 'OFF'}</button></div>
      </aside>
    </main>
    <footer className="timeline"><div className="timeline-controls"><button className="play-button" onClick={() => selectMode(mode === 'live' ? 'simulation' : 'live')} title="切换实时与模拟"><Play size={16} fill="currentColor" /></button><div className="mode-switch"><button className={cn(mode === 'live' && 'active')} onClick={() => selectMode('live')}>LIVE</button><button className={cn(mode === 'simulation' && 'active')} onClick={() => selectMode('simulation')}>SIMULATION</button></div></div><div className="timeline-track-wrap"><div className="timeline-labels"><span className="timeline-center-label">北京时间 · {mode === 'live' ? '实时' : '模拟'}</span></div><div className="time-scale">
        <div className="sun-event sunrise-event" data-minute={minutesFromDate(sunWindow.times.sunrise)} style={{ left: `${minutesFromDate(sunWindow.times.sunrise) / 1440 * 100}%` }}><span>日出 {formatClock(minutesFromDate(sunWindow.times.sunrise))}</span></div>
        <div className="sun-event sunset-event" data-minute={minutesFromDate(sunWindow.times.sunset)} style={{ left: `${minutesFromDate(sunWindow.times.sunset) / 1440 * 100}%` }}><span>日落 {formatClock(minutesFromDate(sunWindow.times.sunset))}</span></div>
        <input aria-label="模拟太阳时间" type="range" min="0" max="1440" value={minutesFromDate(activeDate)} onChange={event => { selectMode('simulation'); setSimMinutes(Math.min(1439, Number(event.target.value))) }} style={{ '--timeline-progress': `${minutesFromDate(activeDate) / 1440 * 100}%` } as React.CSSProperties} />
        <div className="timeline-ticks">{Array.from({ length: 25 }, (_, i) => <i key={i} />)}</div><div className="chart-axis"><span>00:00</span><span>12:00</span><span>24:00</span></div></div></div><div className="timeline-readout"><span className="readout-label">SUN POSITION</span><strong>{snapshot.timeLabel}</strong><span>{degrees(snapshot.altitude)} ALT / {degrees(snapshot.azimuth)} AZ</span></div></footer>
  </div>
}
function BatteryPanel() {
  const charge = mockBatteryTelemetry.chargePercent
  const storedEnergy = Math.round(batteryConfig.capacityWh * charge / 100)
  const netPower = mockBatteryTelemetry.chargingPower - mockBatteryTelemetry.outputPower
  const minutesToFull = Math.round((batteryConfig.capacityWh - storedEnergy) / netPower * 60)
  const particles = Array.from({ length: 6 }, (_, index) => <i key={index} style={{ '--particle-index': index } as React.CSSProperties} />)

  return <aside className="side-panel battery-panel" aria-label="酷态科电能仓 600 状态">
    <div className="panel-header"><div className="panel-icon battery-panel-icon"><BatteryCharging size={16} /></div><div><div className="panel-eyebrow">PORTABLE ENERGY STORAGE</div><h2>电能仓状态</h2></div><span className="mock-badge">MOCK</span></div>
    <div className="battery-state-line"><span><i />太阳能充电中</span><b>+{netPower} W</b></div>

    <div className="energy-flow" aria-label={`当前电量 ${charge}%，充电功率 ${mockBatteryTelemetry.chargingPower} 瓦，用电功率 ${mockBatteryTelemetry.outputPower} 瓦`}>
      <div className="flow-channel flow-channel-input">
        <div className="flow-source"><SolarPanel size={15} /><span>PV IN</span><strong>{mockBatteryTelemetry.chargingPower}<small>W</small></strong></div>
        <div className="flow-line"><span>{particles}</span></div>
      </div>

      <div className="power-station-visual" aria-hidden="true">
        <div className="station-handle"><span /></div>
        <div className="station-body">
          <div className="station-side-vent">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>
          <div className="station-face">
            <div className="station-screen">
              <div className="screen-top"><span>CUKTECH</span><i /></div>
              <div className="screen-charge"><strong>{charge}</strong><span>%</span></div>
              <div className="screen-meta"><span>IN {mockBatteryTelemetry.chargingPower}W</span><span>OUT {mockBatteryTelemetry.outputPower}W</span></div>
              <div className="screen-level"><span style={{ width: `${charge}%` }} /></div>
            </div>
            <div className="station-controls"><span className="station-lamp" /><span className="station-port station-port-round" /><span className="station-port" /><span className="station-port" /></div>
            <div className="station-outlets"><i /><i /></div>
          </div>
        </div>
        <div className="station-feet"><i /><i /></div>
      </div>

      <div className="flow-channel flow-channel-output">
        <div className="flow-line"><span>{particles}</span></div>
        <div className="flow-source"><HousePlug size={15} /><span>HOME LOAD</span><strong>{mockBatteryTelemetry.outputPower}<small>W</small></strong></div>
      </div>
    </div>

    <div className="battery-capacity" role="status">
      <div className="capacity-heading"><span>可用电量</span><strong>{charge}%</strong></div>
      <div className="capacity-track"><span style={{ width: `${charge}%` }} /><i style={{ left: `${charge}%` }} /></div>
      <div className="capacity-detail"><span>{storedEnergy} Wh 可用</span><span>额定 {batteryConfig.capacityWh} Wh</span></div>
    </div>

    <div className="battery-metrics">
      <div><span>充电功率</span><strong className="charge-value">{mockBatteryTelemetry.chargingPower}<small>W</small></strong><em>太阳能上限 {batteryConfig.solarInputMax} W</em></div>
      <div><span>用电功率</span><strong>{mockBatteryTelemetry.outputPower}<small>W</small></strong><em>交流额定 {batteryConfig.acOutputMax} W</em></div>
    </div>

    <div className="battery-forecast"><span>按当前净输入</span><strong>约 {Math.floor(minutesToFull / 60)}h {minutesToFull % 60}m 充满</strong></div>
    <div className="battery-specs"><span>{batteryConfig.chemistry}</span><span>{batteryConfig.modelCode}</span><span>{mockBatteryTelemetry.temperature.toFixed(1)}°C</span></div>
    <p className="battery-note">遥测数据为界面模拟 · 设备额定参数来自公开规格</p>
  </aside>
}
function WeatherPanel({ snapshot, state, choice, setChoice, onRefresh }: { snapshot: SolarSnapshot; state: WeatherState; choice: WeatherChoice; setChoice: (choice: WeatherChoice) => void; onRefresh: () => void }) {
  const weather = snapshot.weather
  const label = state.status === 'disabled' ? '非当前日期 · 天气接口已停用' : choice !== 'auto' ? '模拟情景 · 非实况' : state.status === 'loading' ? '天气加载中 · 暂用晴空' : state.status === 'error' ? '天气不可用 · 晴空回退' : snapshot.weatherSource === 'fallback' ? '该时段缺失 · 晴空回退' : 'Open-Meteo · 逐小时预报'
  return <section className="weather-card" aria-label="天气数据">
    <div className="weather-heading"><CloudSun size={20} /><strong>{weatherNames[weatherKind(weather)]}</strong><b>{weather.temperature.toFixed(1)}°</b><button aria-label="刷新天气" title="刷新天气" onClick={onRefresh} disabled={state.status === 'loading' || state.status === 'disabled'}><RotateCcw size={13} /></button></div>
    <div className="weather-status" role="status" data-source={snapshot.weatherSource}>{label}</div>
    {choice === 'auto' && state.error && <p className="weather-error">{state.error}</p>}
    <div className="weather-values"><span>云量 <b>{Math.round(weather.cloudCover)}%</b></span><span>风速 <b>{weather.windSpeed.toFixed(1)} m/s</b></span><span>降水 <b>{weather.precipitation.toFixed(1)} mm/h</b></span></div>
    <label className="weather-select">天气来源<select aria-label="天气情景" value={choice} onChange={event => setChoice(event.target.value as WeatherChoice)}>{state.status !== 'disabled' && <option value="auto">自动 · 公开天气接口</option>}{Object.entries(weatherNames).map(([key, name]) => <option key={key} value={key}>模拟 · {name}</option>)}</select></label>
    {choice === 'auto' && state.data && <div className="weather-updated">更新于 {new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(state.data.fetchedAt)} · 每 10 分钟刷新</div>}
  </section>
}
function MetricBar({ value, accent }: { value: number; accent: 'cyan' | 'amber' }) { return <div className={cn('metric-bar', accent)}><span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div> }
function TelemetryMetric({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) { return <div className="compact-metric"><div className="metric-label">{icon}{label}</div><strong>{value}</strong><span>{unit}</span></div> }
function PowerChart({ profile, minute, snapshot }: { profile: PowerProfile; minute: number; snapshot: SolarSnapshot }) {
  const width = 270, height = 88
  const path = profile.points.map((p, i) => `${i ? 'L' : 'M'} ${(p.minute / 1440 * width).toFixed(2)} ${(height - p.power / panelConfig.ratedPower * height).toFixed(2)}`).join(' ')
  const x = minute / 1440 * width
  return <div className="power-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="按天气和楼栋遮挡计算的全天光伏功率曲线" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1ba53" stopOpacity="0.3" /><stop offset="1" stopColor="#f1ba53" stopOpacity="0" /></linearGradient></defs><path d={`${path} L270 88 L0 88 Z`} fill="url(#chartFill)" /><path d="M0 22H270M0 55H270" stroke="#71909a" strokeOpacity="0.16" strokeDasharray="2 4" /><path d={path} fill="none" stroke="#f1ba53" strokeWidth="2" /><line x1={x} y1="0" x2={x} y2={height} stroke="#dbe6dc" strokeOpacity="0.58" strokeDasharray="3 4" /><circle cx={x} cy={height - snapshot.solarInputPower / panelConfig.ratedPower * height} r="3" fill="#fff0b7" /></svg><div className="chart-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
}
function formatClock(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
export default App
