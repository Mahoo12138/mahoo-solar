import { useEffect, useMemo, useState } from 'react'
import { GatewayTelemetryClient, loadGatewayConfig } from './client'
import type { BatteryTelemetry, GatewayConfig, GatewayConnectionStatus, TelemetrySnapshotFrame } from './contracts'

export function useBatteryTelemetry() {
  // Vite injects these values at build time. A restart/rebuild is intentional:
  // the gateway token never becomes editable browser state or localStorage data.
  const [config] = useState<GatewayConfig>(() => loadGatewayConfig())
  const [status, setStatus] = useState<GatewayConnectionStatus>(() => config.readToken ? 'connecting' : 'disabled')
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<TelemetrySnapshotFrame>()
  const [telemetry, setTelemetry] = useState<BatteryTelemetry>()
  const client = useMemo(() => new GatewayTelemetryClient(config, {
    onStatus: (next, cause) => { setStatus(next); setError(cause ?? '') },
    onSnapshot: setSnapshot,
    onTelemetry: setTelemetry,
  }), [config])

  useEffect(() => {
    if (config.readToken) client.start()
    else client.stop()
    return () => client.stop()
  }, [client, config.readToken])

  return { config, status, error, snapshot, telemetry }
}
