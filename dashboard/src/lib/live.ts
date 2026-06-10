import { useEffect, useRef, useState } from 'react'

type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'disconnected'

export interface LiveAuditEnvelope {
  type: 'connected' | 'event' | 'heartbeat' | 'error'
  event_id?: string
  timestamp?: string
  ts?: string
  sequence?: number
  risk_score?: number
  action_taken?: string
  llm_provider?: string
  tool_name?: string
  prompt_hash?: string
  categories?: string[]
  severity?: string
  title?: string
  promptPreview?: string
  responsePreview?: string
  latencyMs?: number
  provider?: string
  advisor?: {
    summary?: string
    remediation?: string[]
    compliance_impact?: string
    risk_level?: string
  } | null
  stream_health?: {
    active_streams?: number
    runtime_mode?: string
    degraded_events?: number
  }
}

export interface GovernanceLiveIncident {
  id: string
  timestamp: string
  action: string
  severity: string
  provider: string
  riskScore: number
  traceId: string
  incidentId?: string | null
  promptPreview: string
  responsePreview?: string
  categories: string[]
  advisor?: LiveAuditEnvelope['advisor']
  policyName?: string | null
  latencyMs?: number
  title?: string
}

export function useLiveAuditFeed(limit = 50) {
  const [events, setEvents] = useState<LiveAuditEnvelope[]>([])
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null)
  const [runtimeMode, setRuntimeMode] = useState<string>('STANDARD')
  const [activeStreams, setActiveStreams] = useState(0)
  const [degradedEvents, setDegradedEvents] = useState(0)
  const lastEventIdRef = useRef<string | null>(null)
  const lastSequenceRef = useRef<number>(0)
  const seenRef = useRef<Set<string>>(new Set())
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    const connect = async () => {
      if (cancelled) return
      controller?.abort()
      controller = new AbortController()
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      setStatus((current) => (current === 'connected' ? 'reconnecting' : 'connecting'))

      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/stream/events`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('aigw_token') || ''}`,
              ...(lastEventIdRef.current ? { 'Last-Event-ID': lastEventIdRef.current } : {}),
            },
            signal: controller.signal,
          },
        )

        if (!response.ok || !response.body) {
          throw new Error(`stream_failed_${response.status}`)
        }

        reconnectAttemptRef.current = 0
        setStatus('connected')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''

          for (const chunk of chunks) {
            const lines = chunk.split('\n')
            let currentEventId: string | null = null
            let dataLine = ''
            for (const line of lines) {
              if (line.startsWith('id:')) {
                currentEventId = line.slice(3).trim()
              }
              if (line.startsWith('data:')) {
                dataLine += line.slice(5).trim()
              }
            }

            if (!dataLine) continue

            const payload = JSON.parse(dataLine) as LiveAuditEnvelope
            if (currentEventId) {
              lastEventIdRef.current = currentEventId
            }

            if (typeof payload.sequence === 'number') {
              if (payload.sequence <= lastSequenceRef.current && payload.type !== 'heartbeat') {
                continue
              }
              lastSequenceRef.current = payload.sequence
            }

            if (payload.stream_health?.runtime_mode) setRuntimeMode(payload.stream_health.runtime_mode)
            if (typeof payload.stream_health?.active_streams === 'number') setActiveStreams(payload.stream_health.active_streams)
            if (typeof payload.stream_health?.degraded_events === 'number') setDegradedEvents(payload.stream_health.degraded_events)

            if (payload.type === 'heartbeat') {
              setLastHeartbeat(payload.ts || payload.timestamp || new Date().toISOString())
              continue
            }

            if (payload.type === 'error') {
              setStatus('degraded')
              continue
            }

            if (payload.type === 'event' && payload.event_id && !seenRef.current.has(payload.event_id)) {
              seenRef.current.add(payload.event_id)
              setEvents((current) => {
                const next = [payload, ...current].slice(0, limit)
                const nextIds = new Set(next.map((item) => item.event_id).filter(Boolean) as string[])
                seenRef.current = nextIds
                return next
              })
            }
          }
        }

        if (!cancelled) {
          scheduleReconnect()
        }
      } catch {
        if (!cancelled) {
          setStatus('degraded')
          scheduleReconnect()
        }
      }
    }

    const scheduleReconnect = () => {
      reconnectAttemptRef.current += 1
      const expDelay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 15000)
      const jitter = Math.floor(Math.random() * 400)
      const delay = expDelay + jitter
      reconnectTimerRef.current = window.setTimeout(() => {
        void connect()
      }, delay)
    }

    void connect()

    return () => {
      cancelled = true
      controller?.abort()
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      setStatus('disconnected')
    }
  }, [limit])

  return {
    events,
    status,
    lastHeartbeat,
    runtimeMode,
    activeStreams,
    degradedEvents,
  }
}

export function useGovernanceDemoStream(limit = 50) {
  const [events, setEvents] = useState<GovernanceLiveIncident[]>([])
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const reconnectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    const connect = async () => {
      if (cancelled) return
      controller?.abort()
      controller = new AbortController()
      setStatus((current) => (current === 'connected' ? 'reconnecting' : 'connecting'))

      try {
        const response = await fetch(
          `${import.meta.env.VITE_GOVERNANCE_URL || 'http://localhost:4000'}/api/proxy/stream`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('airlock_token') || localStorage.getItem('aigw_token') || ''}`,
              ...(localStorage.getItem('airlock_workspace_id')
                ? { 'X-Workspace-ID': localStorage.getItem('airlock_workspace_id') as string }
                : {}),
            },
            signal: controller.signal,
          },
        )

        if (!response.ok || !response.body) {
          throw new Error(`stream_failed_${response.status}`)
        }

        setStatus('connected')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''

          for (const chunk of chunks) {
            const dataLine = chunk
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('')
            if (!dataLine) continue
            const payload = JSON.parse(dataLine) as GovernanceLiveIncident
            setEvents((current) => [payload, ...current].slice(0, limit))
          }
        }
      } catch {
        if (!cancelled) {
          setStatus('degraded')
          reconnectTimerRef.current = window.setTimeout(() => {
            void connect()
          }, 2000)
        }
      }
    }

    void connect()

    return () => {
      cancelled = true
      controller?.abort()
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      setStatus('disconnected')
    }
  }, [limit])

  return { events, status, setEvents }
}
