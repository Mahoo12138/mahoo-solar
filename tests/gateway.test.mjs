import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTelemetryFrame, decodeTelemetryFrame, projectBatteryTelemetry } from '../apps/web/src/gateway/codec.ts'
import { normalizeReadToken } from '../apps/web/src/gateway/token.ts'

const snapshot = {
  v: 1,
  type: 'snapshot',
  sequence: 10,
  gateway: { online: true, lastSeenAt: 1000 },
  devices: [{
    id: '1102952372',
    model: 'njcuk.enstor.a11',
    observedAt: 1000,
    values: {
      'battery.percent': { siid: 3, piid: 1, value: 76, observedAt: 1000 },
      'power.input_w': { siid: 2, piid: 9, value: 186, observedAt: 1000 },
      'power.output_w': { siid: 2, piid: 10, value: 62, observedAt: 1000 },
      'temperature.celsius': { siid: 2, piid: 8, value: 28.4, observedAt: 1000 },
    },
  }],
}

test('decodes a versioned snapshot and projects battery telemetry', () => {
  const frame = decodeTelemetryFrame(snapshot)
  assert.equal(frame?.type, 'snapshot')
  const telemetry = projectBatteryTelemetry(frame)
  assert.deepEqual(telemetry, {
    chargePercent: 76,
    chargingPower: 186,
    outputPower: 62,
      chargingRemainingMinutes: undefined,
      outputRemainingMinutes: undefined,
      temperature: 28.4,
    humidity: undefined,
      updatedAt: 1000,
    source: 'gateway',
    rawPropertyCount: 4,
  })
})

test('projects the confirmed CUKTECH packed-field semantics supplied by LX04', () => {
  const frame = decodeTelemetryFrame({
    v: 1,
    type: 'snapshot',
    sequence: 20,
    gateway: { online: true, lastSeenAt: 3000 },
    devices: [{
      id: '1102952372',
      model: 'njcuk.enstor.a11',
      observedAt: 3000,
      values: {
        '2.3': {
          siid: 2,
          piid: 3,
          value: 16842813,
          observedAt: 3000,
          semantic: {
            'battery.percent': { value: 61, unit: '%', confidence: 'confirmed', sourceProperty: '2.3', decoder: 'uint32.low_byte' },
          },
        },
        '2.2': {
          siid: 2,
          piid: 2,
          value: 805443439,
          observedAt: 3000,
          semantic: {
            'power.input_w': { value: 2, unit: 'W', confidence: 'confirmed', sourceProperty: '2.2', decoder: 'uint32.bits_16_27' },
            'power.input_remaining_minutes': { value: 5999, unit: 'min', confidence: 'high', sourceProperty: '2.2', decoder: 'uint32.low_16' },
          },
        },
        '2.1': {
          siid: 2,
          piid: 1,
          value: 805836655,
          observedAt: 3000,
          semantic: {
            'power.output_w': { value: 8, unit: 'W', confidence: 'confirmed', sourceProperty: '2.1', decoder: 'uint32.bits_16_27' },
            'power.output_remaining_minutes': { value: 5999, unit: 'min', confidence: 'high', sourceProperty: '2.1', decoder: 'uint32.low_16' },
          },
        },
      },
    }],
  })

  assert.equal(frame?.type, 'snapshot')
  assert.deepEqual(projectBatteryTelemetry(frame), {
    chargePercent: 61,
    chargingPower: 2,
    outputPower: 8,
    chargingRemainingMinutes: 5999,
    outputRemainingMinutes: 5999,
    temperature: undefined,
    humidity: undefined,
    updatedAt: 3000,
    source: 'gateway',
    rawPropertyCount: 3,
  })
})

test('projects the T2 Bluetooth thermometer as energy-storage ambient metrics', () => {
  const frame = decodeTelemetryFrame({
    v: 1,
    type: 'snapshot',
    sequence: 21,
    gateway: { online: true, lastSeenAt: 4000 },
    devices: [
      {
        id: '1102952372',
        model: 'njcuk.enstor.a11',
        observedAt: 4000,
        values: { '2.3': { siid: 2, piid: 3, value: 16842813, observedAt: 4000 } },
      },
      {
        id: 'blt.3.1mup85fkt0k00',
        model: 'miaomiaoce.sensor_ht.t2',
        displayName: '米家蓝牙温湿度计 2',
        observedAt: 4010,
        values: {
          '2.1001': { siid: 2, piid: 1001, value: 30.4, observedAt: 4010 },
          '2.1002': { siid: 2, piid: 1002, value: 72, observedAt: 4010 },
        },
      },
    ],
  })

  assert.deepEqual(projectBatteryTelemetry(frame), {
    chargePercent: undefined,
    chargingPower: undefined,
    outputPower: undefined,
    chargingRemainingMinutes: undefined,
    outputRemainingMinutes: undefined,
    temperature: 30.4,
    humidity: 72,
    updatedAt: 4010,
    source: 'gateway',
    rawPropertyCount: 3,
  })
})

test('falls back to standard MIoT temperature and humidity property ids', () => {
  const frame = decodeTelemetryFrame({
    v: 1,
    type: 'snapshot',
    sequence: 22,
    gateway: { online: true },
    devices: [{
      id: 'blt.3.standard-t2',
      model: 'miaomiaoce.sensor_ht.t2',
      observedAt: 5000,
      values: {
        '2.1': { siid: 2, piid: 1, value: 29.2, observedAt: 5000 },
        '2.2': { siid: 2, piid: 2, value: 65, observedAt: 5000 },
      },
    }],
  })

  const telemetry = projectBatteryTelemetry(frame)
  assert.equal(telemetry?.temperature, 29.2)
  assert.equal(telemetry?.humidity, 65)
})

test('applies a property patch without discarding other values', () => {
  const initial = decodeTelemetryFrame(snapshot)
  const patch = decodeTelemetryFrame({
    v: 1,
    type: 'property.changed',
    sequence: 11,
    observedAt: 2000,
    device: { id: '1102952372', model: 'njcuk.enstor.a11' },
    property: { siid: 2, piid: 9, value: 192, observedAt: 2000 },
  })
  const next = applyTelemetryFrame(initial, patch)
  assert.equal(next.devices[0].values['2.9'].value, 192)
  assert.equal(next.devices[0].values['battery.percent'].value, 76)
  assert.equal(next.sequence, 11)
})

test('rejects unknown versions and incomplete frames', () => {
  assert.equal(decodeTelemetryFrame({ ...snapshot, v: 2 }), undefined)
  assert.equal(decodeTelemetryFrame({ ...snapshot, devices: 'bad' }), undefined)
})

test('normalizes copied URL-safe Base64 integration tokens', () => {
  assert.equal(normalizeReadToken('abcd'), 'abcd')
  assert.equal(normalizeReadToken('abc'), 'abc=')
  assert.equal(normalizeReadToken('ab=='), 'ab==')
  assert.equal(normalizeReadToken('  abc  '), 'abc=')
})
