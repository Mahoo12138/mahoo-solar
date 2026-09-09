export const apartmentConfig = {
  city: '长沙',
  district: '岳麓区',
  community: '我的小区',
  building: '我的公寓',
  floor: '11F',
  coordinateLabel: '112.865634, 28.233525',
  latitude: 28.233525,
  longitude: 112.865634,
  timezone: 'Asia/Shanghai',
  windowAzimuth: 105,
  windowDirection: '东偏南 15°',
  installation: '阳台内侧（窗内）',
  layout: '两室一厅',
} as const

export const panelConfig = {
  ratedPower: 320,
  voltage: 18,
  azimuth: 105,
  tilt: 90,
  glassTransmission: 0.8,
  model: '室内窗后 320W 光伏板',
} as const

export const deviceConfig = {
  powerStation: '酷态科 600',
  gateway: 'LX04 Mesh Gateway',
  gatewayState: 'MOCK DATA',
  load: 'Mac mini M4 + 2× SSD',
  dailyLoad: 157.28,
} as const

export const mockPowerProfile = [
  { time: '06:00', value: 0 },
  { time: '07:00', value: 12 },
  { time: '08:00', value: 48 },
  { time: '09:00', value: 96 },
  { time: '10:00', value: 151 },
  { time: '11:00', value: 204 },
  { time: '12:00', value: 253 },
  { time: '13:00', value: 285 },
  { time: '14:00', value: 276 },
  { time: '15:00', value: 240 },
  { time: '16:00', value: 188 },
  { time: '17:00', value: 102 },
  { time: '18:30', value: 0 },
]
