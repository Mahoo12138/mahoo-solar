import type {
  BatteryTelemetry,
  TelemetryDevice,
  TelemetryFrame,
  TelemetryProperty,
  TelemetrySemanticValue,
  TelemetrySnapshotFrame,
} from './contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function semanticValues(value: unknown): Record<string, TelemetrySemanticValue> | undefined {
  if (!isRecord(value)) return undefined
  const output: Record<string, TelemetrySemanticValue> = {}
  Object.entries(value).forEach(([key, item]) => {
    if (!isRecord(item)) return
    const semanticValue = number(item.value)
    if (semanticValue === undefined) return
    output[key] = {
      value: semanticValue,
      unit: typeof item.unit === 'string' ? item.unit : undefined,
      confidence: typeof item.confidence === 'string' ? item.confidence : undefined,
      sourceProperty: typeof item.sourceProperty === 'string' ? item.sourceProperty : undefined,
      decoder: typeof item.decoder === 'string' ? item.decoder : undefined,
    }
  })
  return Object.keys(output).length ? output : undefined
}

function property(value: unknown): TelemetryProperty | undefined {
  if (!isRecord(value)) return undefined
  const siid = number(value.siid)
  const piid = number(value.piid)
  const observedAt = number(value.observedAt)
  if (siid === undefined || piid === undefined || observedAt === undefined || !('value' in value)) return undefined
  return {
    siid,
    piid,
    value: value.value,
    observedAt,
    method: typeof value.method === 'string' ? value.method : undefined,
    definition: isRecord(value.definition) ? {
      label: typeof value.definition.label === 'string' ? value.definition.label : undefined,
      meaning: typeof value.definition.meaning === 'string' ? value.definition.meaning : undefined,
      confidence: typeof value.definition.confidence === 'string' ? value.definition.confidence : undefined,
      source: typeof value.definition.source === 'string' ? value.definition.source : undefined,
      unit: typeof value.definition.unit === 'string' ? value.definition.unit : undefined,
      format: typeof value.definition.format === 'string' ? value.definition.format : undefined,
      intervalSeconds: number(value.definition.intervalSeconds),
      encoding: typeof value.definition.encoding === 'string' ? value.definition.encoding : undefined,
      decodeStatus: typeof value.definition.decodeStatus === 'string' ? value.definition.decodeStatus : undefined,
    } : undefined,
    semantic: semanticValues(value.semantic),
  }
}

function device(value: unknown): TelemetryDevice | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  const observedAt = number(value.observedAt)
  if (observedAt === undefined || !isRecord(value.values)) return undefined
  const values: Record<string, TelemetryProperty | unknown> = {}
  Object.entries(value.values).forEach(([key, item]) => {
    values[key] = property(item) ?? item
  })
  return {
    id: value.id,
    model: typeof value.model === 'string' ? value.model : undefined,
    displayName: typeof value.displayName === 'string' ? value.displayName : undefined,
    pdid: number(value.pdid),
    observedAt,
    values,
  }
}

export function decodeTelemetryFrame(value: unknown): TelemetryFrame | undefined {
  if (!isRecord(value) || value.v !== 1 || typeof value.type !== 'string') return undefined
  const sequence = number(value.sequence)
  if (sequence === undefined) return undefined
  if (value.type === 'snapshot') {
    if (!isRecord(value.gateway) || typeof value.gateway.online !== 'boolean' || !Array.isArray(value.devices)) return undefined
    const devices = value.devices.map(device).filter((item): item is TelemetryDevice => Boolean(item))
    return { v: 1, type: 'snapshot', sequence, gateway: { online: value.gateway.online, lastSeenAt: number(value.gateway.lastSeenAt) ?? null }, devices }
  }
  if (value.type === 'property.changed') {
    if (!isRecord(value.device) || typeof value.device.id !== 'string') return undefined
    const observedAt = number(value.observedAt)
    const nextProperty = property(value.property)
    if (observedAt === undefined || !nextProperty) return undefined
    return {
      v: 1,
      type: 'property.changed',
      sequence,
      observedAt,
      device: {
        id: value.device.id,
        model: typeof value.device.model === 'string' ? value.device.model : undefined,
        displayName: typeof value.device.displayName === 'string' ? value.device.displayName : undefined,
        pdid: number(value.device.pdid),
      },
      property: nextProperty,
    }
  }
  if (value.type === 'gateway.state') {
    const observedAt = number(value.observedAt)
    if (observedAt === undefined || typeof value.online !== 'boolean' || typeof value.reason !== 'string') return undefined
    return { v: 1, type: 'gateway.state', sequence, observedAt, online: value.online, reason: value.reason }
  }
  return undefined
}

export function applyTelemetryFrame(current: TelemetrySnapshotFrame | undefined, frame: TelemetryFrame): TelemetrySnapshotFrame | undefined {
  if (frame.type === 'snapshot') return frame
  if (frame.type === 'gateway.state') {
    if (!current) return undefined
    return { ...current, sequence: frame.sequence, gateway: { ...current.gateway, online: frame.online } }
  }
  if (!current) return undefined
  const devices = current.devices.map((item) => {
    if (item.id !== frame.device.id) return item
    return {
      ...item,
      model: frame.device.model ?? item.model,
      displayName: frame.device.displayName ?? item.displayName,
      pdid: frame.device.pdid ?? item.pdid,
      observedAt: frame.observedAt,
      values: { ...item.values, [`${frame.property.siid}.${frame.property.piid}`]: frame.property },
    }
  })
  if (!devices.some((item) => item.id === frame.device.id)) {
    devices.push({
      id: frame.device.id,
      model: frame.device.model,
      displayName: frame.device.displayName,
      pdid: frame.device.pdid,
      observedAt: frame.observedAt,
      values: { [`${frame.property.siid}.${frame.property.piid}`]: frame.property },
    })
  }
  return { ...current, sequence: frame.sequence, devices }
}

export function projectBatteryTelemetry(snapshot: TelemetrySnapshotFrame | undefined): BatteryTelemetry | undefined {
  if (!snapshot) return undefined
  const batteryDevice = snapshot.devices.find((item) => item.model === 'njcuk.enstor.a11')
  const thermometerDevice = snapshot.devices.find((item) => item.model === 'miaomiaoce.sensor_ht.t2' || item.displayName?.includes('温湿度'))
  if (!batteryDevice && !thermometerDevice) return undefined

  const semantic = (device: TelemetryDevice | undefined, key: string): number | undefined => {
    if (!device) return undefined
    const value = device.values[key]
    if (isRecord(value) && 'value' in value) return number(value.value)
    const direct = number(value)
    if (direct !== undefined) return direct
    let latest: { value: number; observedAt: number } | undefined
    for (const candidate of Object.values(device.values)) {
      if (!isRecord(candidate) || !isRecord(candidate.semantic)) continue
      const decoded = candidate.semantic[key]
      if (!isRecord(decoded)) continue
      const decodedValue = number(decoded.value)
      const observedAt = number(candidate.observedAt) ?? device.observedAt
      if (decodedValue !== undefined && (!latest || observedAt >= latest.observedAt)) {
        latest = { value: decodedValue, observedAt }
      }
    }
    return latest?.value
  }

  const rawValue = (device: TelemetryDevice | undefined, keys: string[]): number | undefined => {
    if (!device) return undefined
    for (const key of keys) {
      const value = device.values[key]
      if (isRecord(value) && 'value' in value) {
        const decoded = number(value.value)
        if (decoded !== undefined) return decoded
      }
      const direct = number(value)
      if (direct !== undefined) return direct
    }
    return undefined
  }

  const properties = [batteryDevice, thermometerDevice]
    .filter((item, index, all): item is TelemetryDevice => Boolean(item) && all.indexOf(item) === index)
    .flatMap((item) => Object.values(item.values))
  const values = {
    chargePercent: semantic(batteryDevice, 'battery.percent'),
    chargingPower: semantic(batteryDevice, 'power.input_w'),
    outputPower: semantic(batteryDevice, 'power.output_w'),
    chargingRemainingMinutes: semantic(batteryDevice, 'power.input_remaining_minutes'),
    outputRemainingMinutes: semantic(batteryDevice, 'power.output_remaining_minutes'),
    // The T2 has both MIoT ids (2.1 / 2.2) and gateway extension ids
    // (2.1001 / 2.1002). Prefer semantic projections, then preserve the
    // raw values so a schema revision does not hide a valid reading.
    temperature: semantic(thermometerDevice, 'temperature.celsius')
      ?? semantic(thermometerDevice, 'temperature')
      ?? rawValue(thermometerDevice, ['2.1001', '2.1'])
      ?? semantic(batteryDevice, 'temperature.celsius'),
    humidity: semantic(thermometerDevice, 'humidity.percent')
      ?? semantic(thermometerDevice, 'humidity')
      ?? rawValue(thermometerDevice, ['2.1002', '2.2']),
  }
  if (Object.values(values).every((value) => value === undefined)) {
    return { updatedAt: Math.max(batteryDevice?.observedAt ?? 0, thermometerDevice?.observedAt ?? 0), source: 'gateway', rawPropertyCount: properties.length }
  }
  return {
    ...values,
    updatedAt: Math.max(batteryDevice?.observedAt ?? 0, thermometerDevice?.observedAt ?? 0),
    source: 'gateway',
    rawPropertyCount: properties.length,
  }
}
