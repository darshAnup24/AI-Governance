import { useEffect, useRef, useState } from 'react'

type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'disconnected'

export interface LiveAuditEnvelope {
  type: 'connected' | 'event' | 'heartbeat' | 'error'
  event_id?: string
  timestamp?: string
  sequence?: number
  risk_score?: number
  action_taken?: string
  llm_provider?: string
  categories?: string[]
  stream_health?: {
    active_streams?: number
    runtime_mode?: string
    degraded_events?: number
  }
}

export function useLiveAuditFeed(limit = 50) {
  const [events, setEvents] = useState<LiveAuditEnvelope[]>([])
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null)
  const [runtimeMode, setRuntimeMode] = useState<string>('STANDARD')
  const [activeStreams, setActiveStreams] = useState(0)
  const [degradedEvents, setDegradedEvents] = useState(0)
  const lastEventIdRef = useRef<string | null>(null)
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

            if (payload.stream_health?.runtime_mode) setRuntimeMode(payload.stream_health.runtime_mode)
            if (typeof payload.stream_health?.active_streams === 'number') setActiveStreams(payload.stream_health.active_streams)
            if (typeof payload.stream_health?.degraded_events === 'number') setDegradedEvents(payload.stream_health.degraded_events)

            if (payload.type === 'heartbeat') {
              setLastHeartbeat(new Date().toISOString())
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
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 15000)
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
