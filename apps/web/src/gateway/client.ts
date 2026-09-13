import { applyTelemetryFrame, decodeTelemetryFrame, projectBatteryTelemetry } from './codec'
import { normalizeReadToken } from './token'
import type {
  BatteryTelemetry,
  GatewayConfig,
  GatewayConnectionStatus,
  TelemetrySnapshotFrame,
} from './contracts'

const DEFAULT_BASE_URL = 'http://10.0.0.235:8765'

export function loadGatewayConfig(): GatewayConfig {
  // Keep each key statically addressable: Vite replaces these expressions at
  // build time, whereas dynamic import.meta.env[name] access is not portable.
  const baseUrl = (import.meta.env.VITE_LX04_GATEWAY_URL || import.meta.env.VITE_LX04_TELEMETRY_URL || DEFAULT_BASE_URL).trim()
  const readToken = (import.meta.env.VITE_LX04_MESH_READ_TOKEN || '').trim()
  return { baseUrl: baseUrl.replace(/\/$/, ''), readToken: normalizeReadToken(readToken) }
}

export type GatewayClientHandlers = {
  onStatus: (status: GatewayConnectionStatus, error?: string) => void
  onSnapshot: (snapshot: TelemetrySnapshotFrame) => void
  onTelemetry: (telemetry: BatteryTelemetry | undefined) => void
}

export class GatewayTelemetryClient {
  private socket: WebSocket | undefined
  private stopped = true
  private reconnectTimer: number | undefined
  private reconnectAttempt = 0
  private snapshot: TelemetrySnapshotFrame | undefined
  private lastMessageAt = 0
  private lastSequence = 0

  constructor(private config: GatewayConfig, private readonly handlers: GatewayClientHandlers) {}

  updateConfig(config: GatewayConfig) {
    this.config = config
  }

  start() {
    this.stopped = false
    void this.connect()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.socket?.close()
    this.socket = undefined
    this.handlers.onStatus('disabled')
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer !== undefined) return
    const delay = Math.min(30_000, 2_000 * (2 ** Math.min(this.reconnectAttempt, 4)))
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 5)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined
      void this.connect()
    }, delay)
  }

  private async ticket(): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/auth/ws-ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.readToken}` },
    })
    if (response.status === 401) throw new Error('read_token_unauthorized')
    if (!response.ok) throw new Error(`ticket_http_${response.status}`)
    const value = await response.json() as { ticket?: string }
    if (!value.ticket) throw new Error('ticket_missing')
    return value.ticket
  }

  private async loadSnapshot(): Promise<TelemetrySnapshotFrame> {
    const response = await fetch(`${this.config.baseUrl}/api/v1/telemetry/snapshot`, {
      headers: { Authorization: `Bearer ${this.config.readToken}` },
    })
    if (response.status === 401) throw new Error('read_token_unauthorized')
    if (!response.ok) throw new Error(`snapshot_http_${response.status}`)
    const frame = decodeTelemetryFrame(await response.json())
    if (!frame || frame.type !== 'snapshot') throw new Error('snapshot_invalid')
    return frame
  }

  private async connect() {
    if (this.stopped || this.socket || !this.config.readToken) {
      if (!this.config.readToken) this.handlers.onStatus('disabled')
      return
    }
    this.handlers.onStatus('connecting')
    try {
      const initial = await this.loadSnapshot()
      this.snapshot = initial
      this.lastSequence = initial.sequence
      this.handlers.onSnapshot(initial)
      this.handlers.onTelemetry(projectBatteryTelemetry(initial))
      if (!initial.gateway.online) {
        this.handlers.onStatus('gateway-offline')
        this.scheduleReconnect()
        return
      }
      const ticket = await this.ticket()
      if (this.stopped) return
      const url = new URL(`${this.config.baseUrl}/ws/telemetry`)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('ticket', ticket)
      const socket = new WebSocket(url, 'lx04-json')
      this.socket = socket
      socket.onopen = () => {
        this.reconnectAttempt = 0
        this.lastMessageAt = Date.now()
        this.handlers.onStatus('live')
      }
      socket.onmessage = (message) => {
        try {
          const frame = decodeTelemetryFrame(JSON.parse(String(message.data)))
          if (!frame) return
          this.lastMessageAt = Date.now()
          if (this.lastSequence > 0 && frame.sequence > this.lastSequence + 1) {
            void this.reloadSnapshot()
          }
          this.lastSequence = Math.max(this.lastSequence, frame.sequence)
          const next = applyTelemetryFrame(this.snapshot, frame)
          if (next) {
            this.snapshot = next
            this.handlers.onSnapshot(next)
            this.handlers.onTelemetry(projectBatteryTelemetry(next))
          }
          if (frame.type === 'gateway.state' && !frame.online) this.handlers.onStatus('gateway-offline')
        } catch {
          this.handlers.onStatus('error', 'telemetry_frame_invalid')
        }
      }
      socket.onerror = () => this.handlers.onStatus('error', 'websocket_error')
      socket.onclose = () => {
        if (this.socket === socket) this.socket = undefined
        if (!this.stopped) {
          this.handlers.onStatus(this.lastMessageAt && Date.now() - this.lastMessageAt > 30_000 ? 'stale' : 'gateway-offline')
          this.scheduleReconnect()
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'gateway_connect_failed'
      this.handlers.onStatus(message === 'read_token_unauthorized' ? 'unauthorized' : 'error', message)
      this.scheduleReconnect()
    }
  }

  private async reloadSnapshot() {
    try {
      const next = await this.loadSnapshot()
      this.snapshot = next
      this.lastSequence = next.sequence
      this.handlers.onSnapshot(next)
      this.handlers.onTelemetry(projectBatteryTelemetry(next))
    } catch {
      // The live socket remains useful even if a best-effort recovery request fails.
    }
  }
}
