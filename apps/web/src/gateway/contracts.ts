export type GatewayConnectionStatus =
  | 'disabled'
  | 'connecting'
  | 'live'
  | 'stale'
  | 'gateway-offline'
  | 'unauthorized'
  | 'error'

export type TelemetrySemanticValue = {
  value: number
  unit?: string
  confidence?: 'confirmed' | 'high' | 'candidate' | string
  sourceProperty?: string
  decoder?: string
}

export type TelemetryProperty = {
  siid: number
  piid: number
  value: unknown
  observedAt: number
  method?: string
  definition?: {
    label?: string
    meaning?: string
    confidence?: string
    source?: string
    unit?: string
    format?: string
    intervalSeconds?: number
    encoding?: string
    decodeStatus?: string
  }
  semantic?: Record<string, TelemetrySemanticValue>
}

export type TelemetryDevice = {
  id: string
  model?: string
  displayName?: string
  pdid?: number
  observedAt: number
  /** Keys are currently numeric siid/piid pairs; semantic keys may be added later. */
  values: Record<string, TelemetryProperty | unknown>
}

export type TelemetrySnapshotFrame = {
  v: 1
  type: 'snapshot'
  sequence: number
  gateway: { online: boolean; lastSeenAt?: number | null }
  devices: TelemetryDevice[]
}

export type TelemetryPropertyFrame = {
  v: 1
  type: 'property.changed'
  sequence: number
  observedAt: number
  device: { id: string; model?: string; displayName?: string; pdid?: number }
  property: TelemetryProperty
}

export type GatewayStateFrame = {
  v: 1
  type: 'gateway.state'
  sequence: number
  observedAt: number
  online: boolean
  reason: string
}

export type TelemetryFrame =
  | TelemetrySnapshotFrame
  | TelemetryPropertyFrame
  | GatewayStateFrame

export type GatewayConfig = {
  baseUrl: string
  readToken: string
}

export type GatewayStatus = {
  gatewayOnline?: boolean
  telemetryApiVersion?: number
  telemetryWebsocketPath?: string
}

export type BatteryTelemetry = {
  chargePercent?: number
  chargingPower?: number
  outputPower?: number
  chargingRemainingMinutes?: number
  outputRemainingMinutes?: number
  temperature?: number
  /** Ambient temperature projected from the paired Bluetooth thermometer. */
  humidity?: number
  updatedAt: number
  source: 'gateway'
  rawPropertyCount: number
}
