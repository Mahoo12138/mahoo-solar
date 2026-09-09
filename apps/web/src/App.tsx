import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BatteryCharging,
  Camera,
  Gauge,
  Layers3,
  MapPin,
  Play,
  Radio,
  RotateCcw,
  Sun,
  SunMedium,
  Waves,
  Zap,
} from 'lucide-react'
import { deviceConfig, panelConfig } from './data/mockData'
import ApartmentScene, { type SceneCameraPreset } from './scenes/ApartmentScene'
import { buildDateAtMinutes, chartPath, getSolarSnapshot, getSunWindow, type SolarSnapshot } from './lib/solar'

type Mode = 'live' | 'simulation'

const cn = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ')
const minutesFromDate = (date: Date) => date.getHours() * 60 + date.getMinutes()
const clampTimelineMinutes = (minutes: number) => Math.max(360, Math.min(1110, minutes))
const dateInputValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateFromInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}
const pct = (value: number) => `${Math.round(value * 100)}%`
const degrees = (value: number) => `${Math.round(value)}°`

function App() {
  const [mode, setMode] = useState<Mode>('live')
  const [liveNow, setLiveNow] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => dateInputValue(new Date()))
  const [simMinutes, setSimMinutes] = useState(() => {
    const current = new Date()
    return clampTimelineMinutes(minutesFromDate(current))
  })
  const [showRays, setShowRays] = useState(true)
  const [cameraPreset, setCameraPreset] = useState<SceneCameraPreset>('room')
  const [sceneExposure, setSceneExposure] = useState(0.82)

  useEffect(() => {
    if (mode !== 'live') return
    const timer = window.setInterval(() => setLiveNow(new Date()), 10000)
    return () => window.clearInterval(timer)
  }, [mode])

  const activeDate = useMemo(
    () => (mode === 'live' ? liveNow : buildDateAtMinutes(dateFromInput(selectedDate), simMinutes)),
    [liveNow, mode, selectedDate, simMinutes],
  )
  const snapshot = useMemo(() => getSolarSnapshot(activeDate), [activeDate])
  const displaySnapshot = useMemo(() => ({ ...snapshot, exposureRatio: sceneExposure }), [sceneExposure, snapshot])
  const sunWindow = useMemo(() => getSunWindow(activeDate), [activeDate])

  const selectMode = (nextMode: Mode) => {
    if (nextMode === 'simulation' && mode !== 'simulation') {
      setSelectedDate(dateInputValue(liveNow))
      setSimMinutes(clampTimelineMinutes(minutesFromDate(liveNow)))
    }
    setMode(nextMode)
  }

  const changeDate = (nextDate: string) => {
    if (!nextDate) return
    setSelectedDate(nextDate)
    setSimMinutes(mode === 'live' ? clampTimelineMinutes(minutesFromDate(liveNow)) : simMinutes)
    setMode('simulation')
  }

  const resetLive = () => {
    const now = new Date()
    setLiveNow(now)
    setSelectedDate(dateInputValue(now))
    setMode('live')
  }

  return (
    <div className="app-shell">
      <TopBar mode={mode} snapshot={snapshot} dateValue={dateInputValue(activeDate)} onDateChange={changeDate} onReset={resetLive} />
      <main className="workspace">
        <SolarScene snapshot={displaySnapshot} showRays={showRays} preset={cameraPreset} setPreset={setCameraPreset} onExposureChange={setSceneExposure} />
        <TelemetryPanel snapshot={displaySnapshot} showRays={showRays} setShowRays={setShowRays} />
      </main>
      <Timeline
        mode={mode}
        simMinutes={simMinutes}
        snapshot={snapshot}
        sunrise={sunWindow.times.sunrise}
        sunset={sunWindow.times.sunset}
        onModeChange={selectMode}
        onMinutesChange={setSimMinutes}
      />
    </div>
  )
}

function TopBar({ mode, snapshot, dateValue, onDateChange, onReset }: { mode: Mode; snapshot: SolarSnapshot; dateValue: string; onDateChange: (value: string) => void; onReset: () => void }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark"><SunMedium size={17} strokeWidth={1.7} /></div>
        <div>
          <div className="brand-name"><span>SOLAR</span> APARTMENT</div>
          <div className="brand-subtitle">PERSONAL ENERGY TWIN / 01</div>
        </div>
      </div>
      <div className="topbar-location"><MapPin size={15} /><span>PERSONAL APARTMENT SYSTEM</span></div>
      <div className="topbar-actions">
        <div className="data-source"><span className="status-dot" /> {mode === 'live' ? 'LIVE DATA' : 'MOCK DATA'}</div>
        <div className="topbar-time"><strong>{snapshot.timeLabel}</strong><label className="date-picker" title="选择模拟日期"><span>DATE</span><input aria-label="选择日期" type="date" value={dateValue} onChange={(event) => onDateChange(event.target.value)} /></label></div>
        <button className="icon-button" title="恢复实时模式" onClick={onReset}><RotateCcw size={15} /></button>
      </div>
    </header>
  )
}

function PanelHeader({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) {
  return <div className="panel-header"><div className="panel-icon">{icon}</div><div><div className="panel-eyebrow">{eyebrow}</div><h2>{title}</h2></div></div>
}

function SolarScene({ snapshot, showRays, preset, setPreset, onExposureChange }: { snapshot: SolarSnapshot; showRays: boolean; preset: SceneCameraPreset; setPreset: (preset: SceneCameraPreset) => void; onExposureChange: (ratio: number) => void }) {
  return (
    <section className="scene-panel">
      <div className="scene-toolbar">
        <div><span className="scene-kicker">THREE.JS SCENE / PHYSICAL MODEL</span><h1>阳光 · 窗户 · 光伏板</h1></div>
        <div className="scene-meta"><span className="scene-live-dot" /> <span>{snapshot.directSunlight ? 'DIRECT SUNLIGHT' : 'DIFFUSE LIGHT'}</span><span className="scene-meta-divider" /><span>AZ {degrees(snapshot.azimuth)}</span></div>
      </div>
      <div className="scene-canvas three-scene-canvas">
        <ApartmentScene snapshot={snapshot} showRays={showRays} preset={preset} onExposureRatioChange={onExposureChange} />
        <div className="scene-overlay">
          <div className="scene-orientation"><span className="axis-east">EAST +X</span><span>UP +Y</span><span className="axis-north">NORTH +Z</span></div>
          <div className="camera-presets">
            <span className="camera-label"><Camera size={12} /> CAMERA</span>
            {(['overview', 'room', 'panel'] as const).map((item) => <button key={item} className={cn(preset === item && 'active')} onClick={() => setPreset(item)}>{item.toUpperCase()}</button>)}
          </div>
        </div>
        <div className="scene-bottom-label"><span>太阳高度角 <strong>{degrees(snapshot.altitude)}</strong></span><span>入射角 <strong>{degrees(snapshot.incidenceAngle)}</strong></span><span>直射面积 <strong>{pct(snapshot.exposureRatio)}</strong></span></div>
      </div>
    </section>
  )
}

function TelemetryPanel({ snapshot, showRays, setShowRays }: { snapshot: SolarSnapshot; showRays: boolean; setShowRays: (value: boolean) => void }) {
  return (
    <aside className="side-panel telemetry-panel">
      <PanelHeader eyebrow="ENERGY FLOW / 能源流" title="实时遥测" icon={<Activity size={16} />} />
      <div className="panel-context"><Layers3 size={14} /><span>PHYSICAL MODEL / MOCK GATEWAY</span></div>
      <div className="power-hero"><div className="metric-label"><Zap size={14} />光伏输入</div><div className="power-value">{snapshot.solarInputPower}<span>W</span></div><MetricBar value={snapshot.solarInputPower / panelConfig.ratedPower} accent="cyan" /><div className="metric-range"><span>0 W</span><span>{panelConfig.ratedPower} W</span></div></div>
      <TelemetryMetric icon={<Sun size={16} />} label="太阳高度角" value={degrees(snapshot.altitude)} progress={Math.max(0, snapshot.altitude / 90)} accent="amber" hint={`AZ ${degrees(snapshot.azimuth)}`} />
      <TelemetryMetric icon={<Gauge size={16} />} label="几何利用率" value={pct(snapshot.geometricFactor)} progress={snapshot.geometricFactor} accent="amber" hint={`入射 ${degrees(snapshot.incidenceAngle)}`} />
      <TelemetryMetric icon={<BatteryCharging size={16} />} label="电池电量" value={`${snapshot.batteryLevel}%`} progress={snapshot.batteryLevel / 100} accent="cyan" hint="充电中" />
      <TelemetryMetric icon={<Waves size={16} />} label="直射面积" value={pct(snapshot.exposureRatio)} progress={snapshot.exposureRatio} accent="cyan" hint="96 点 Raycast" />
      <div className="panel-divider telemetry-divider" />
      <div className="chart-section"><div className="chart-header"><div><div className="subsection-label">TODAY / 今日变化</div><h3>光伏输入曲线</h3></div><div className="chart-total">1.42 <span>kWh</span></div></div><PowerChart progress={snapshot.sunProgress} /></div>
      <div className="telemetry-footer"><div className="device-state"><Radio size={13} /><span>{deviceConfig.gateway}</span><em>{deviceConfig.gatewayState}</em></div><button className={cn('ray-toggle', showRays && 'active')} onClick={() => setShowRays(!showRays)}><Waves size={13} />光线 {showRays ? 'ON' : 'OFF'}</button></div>
    </aside>
  )
}

function MetricBar({ value, accent }: { value: number; accent: 'cyan' | 'amber' }) { return <div className={cn('metric-bar', accent)}><span style={{ width: `${Math.max(1, Math.min(100, value * 100))}%` }} /></div> }

function TelemetryMetric({ icon, label, value, progress, accent, hint }: { icon: React.ReactNode; label: string; value: string; progress: number; accent: 'cyan' | 'amber'; hint: string }) {
  return <div className="telemetry-metric"><div className="telemetry-metric-top"><div className="metric-label">{icon}{label}</div><span className="metric-hint">{hint}</span></div><div className="telemetry-metric-value">{value}</div><MetricBar value={progress} accent={accent} /></div>
}

function PowerChart({ progress }: { progress: number }) {
  const width = 270
  const height = 88
  const x = progress * width
  return <div className="power-chart"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1ba53" stopOpacity="0.28" /><stop offset="1" stopColor="#f1ba53" stopOpacity="0" /></linearGradient></defs><path d={`${chartPath(width, height)} L ${width} ${height} L 0 ${height} Z`} fill="url(#chartFill)" /><path d={chartPath(width, height)} fill="none" stroke="#f1ba53" strokeWidth="2" /><path d="M0 22H270M0 55H270" stroke="#71909a" strokeOpacity="0.16" strokeDasharray="2 4" /><line x1={x} y1="5" x2={x} y2={height} stroke="#dbe6dc" strokeOpacity="0.58" strokeDasharray="3 4" /><circle cx={x} cy={height - (Math.sin(Math.PI * progress) * 0.92 * height)} r="4" fill="#fff0b7" stroke="#f1ba53" strokeWidth="2" /></svg><div className="chart-axis"><span>06:00</span><span>12:00</span><span>18:30</span></div></div>
}

function Timeline({ mode, simMinutes, snapshot, sunrise, sunset, onModeChange, onMinutesChange }: { mode: Mode; simMinutes: number; snapshot: SolarSnapshot; sunrise: Date; sunset: Date; onModeChange: (mode: Mode) => void; onMinutesChange: (value: number) => void }) {
  const min = 360
  const max = 1110
  const sunriseMinutes = sunrise.getHours() * 60 + sunrise.getMinutes()
  const sunsetMinutes = sunset.getHours() * 60 + sunset.getMinutes()
  const displayMinutes = mode === 'live' ? minutesFromDate(new Date()) : simMinutes
  const value = Math.min(max, Math.max(min, displayMinutes))
  return <footer className="timeline"><div className="timeline-controls"><button className="play-button" onClick={() => onModeChange(mode === 'live' ? 'simulation' : 'live')} title={mode === 'live' ? '进入模拟模式' : '回到实时模式'}><Play size={16} fill="currentColor" /></button><div className="mode-switch"><button className={cn(mode === 'live' && 'active')} onClick={() => onModeChange('live')}>LIVE</button><button className={cn(mode === 'simulation' && 'active')} onClick={() => onModeChange('simulation')}>SIMULATION</button></div></div><div className="timeline-track-wrap"><div className="timeline-labels"><span>{formatClock(sunriseMinutes)}</span><span className="timeline-center-label">{mode === 'live' ? 'LIVE / REAL TIME' : 'SIMULATION / MOCK SUN'}</span><span>{formatClock(sunsetMinutes)}</span></div><input aria-label="模拟太阳时间" type="range" min={min} max={max} value={value} onChange={(event) => { onModeChange('simulation'); onMinutesChange(Number(event.target.value)) }} style={{ '--timeline-progress': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} /><div className="timeline-ticks">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</div></div><div className="timeline-readout"><span className="readout-label">SUN POSITION</span><strong>{snapshot.timeLabel}</strong><span>{degrees(snapshot.altitude)} ALT</span></div></footer>
}

function formatClock(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }

export default App
