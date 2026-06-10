import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Gauge,
  ShieldCheck,
  Zap,
  Play,
  Pause,
  RotateCcw,
  TrendingUp,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Gateway Security — ML-powered abnormal API usage detection + predictive throttling.
 *
 * Self-contained demo surface. Simulates live per-client API traffic, learns a
 * rolling baseline (EWMA), predicts the next window's load via short-horizon
 * extrapolation, and pre-emptively throttles clients predicted to breach their
 * rate limit — before a DoS spike lands. No backend dependency: safe for demos.
 */

// ── Tunables ──────────────────────────────────────────────────────────────────
const TICK_MS = 1500 // each tick = one "minute" of simulated traffic
const WINDOW = 30 // points kept on the timeline
const EWMA_ALPHA = 0.3 // baseline smoothing
const ANOMALY_FACTOR = 2.5 // current > baseline * factor => abnormal
const RATE_LIMIT = 220 // per-client requests/min ceiling

type ClientState = {
  id: string
  label: string
  baseline: number // learned normal rate
  current: number // this tick's req/min
  predicted: number // predicted next-tick req/min
  history: number[]
  spikeTicks: number // remaining ticks of an injected spike
}

type Status = 'NORMAL' | 'ANOMALY' | 'THROTTLED'

const INITIAL: ClientState[] = [
  { id: 'svc-checkout', label: 'checkout-service', baseline: 90, current: 90, predicted: 90, history: [], spikeTicks: 0 },
  { id: 'svc-search', label: 'search-service', baseline: 140, current: 140, predicted: 140, history: [], spikeTicks: 0 },
  { id: 'svc-mobile', label: 'mobile-gateway', baseline: 60, current: 60, predicted: 60, history: [], spikeTicks: 0 },
  { id: 'svc-partner', label: 'partner-api', baseline: 40, current: 40, predicted: 40, history: [], spikeTicks: 0 },
]

const CLIENT_COLORS: Record<string, string> = {
  'svc-checkout': '#3b82f6',
  'svc-search': '#8b5cf6',
  'svc-mobile': '#10b981',
  'svc-partner': '#f59e0b',
}

function noise(base: number) {
  return Math.max(0, Math.round(base + (Math.random() - 0.5) * base * 0.35))
}

// Short-horizon prediction: extrapolate the recent slope on top of the baseline.
function predictNext(history: number[], baseline: number): number {
  if (history.length < 3) return baseline
  const recent = history.slice(-3)
  const slope = (recent[2] - recent[0]) / 2
  return Math.max(0, Math.round(recent[2] + slope * 1.5))
}

function statusOf(c: ClientState): Status {
  if (c.predicted > RATE_LIMIT) return 'THROTTLED'
  if (c.current > c.baseline * ANOMALY_FACTOR) return 'ANOMALY'
  return 'NORMAL'
}

const STATUS_CFG: Record<Status, { label: string; cls: string; dot: string }> = {
  NORMAL: { label: 'Normal', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  ANOMALY: { label: 'Abnormal', cls: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  THROTTLED: { label: 'Throttled', cls: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500' },
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  icon: typeof Activity
  tone?: 'default' | 'danger' | 'warn' | 'ok'
}) {
  const toneCls =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'ok'
          ? 'text-emerald-600'
          : 'text-[var(--foreground)]'
  return (
    <div className="rounded-xl border bg-[var(--background)] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </div>
      <p className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{sub}</p> : null}
    </div>
  )
}

export default function GatewaySecurityPage() {
  const [clients, setClients] = useState<ClientState[]>(INITIAL)
  const [running, setRunning] = useState(true)
  const [timeline, setTimeline] = useState<Array<Record<string, number>>>([])
  const tickRef = useRef(0)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      tickRef.current += 1
      setClients((prev) =>
        prev.map((c) => {
          const spiking = c.spikeTicks > 0
          // During an injected spike the client ramps far above its baseline.
          const target = spiking ? c.baseline * (3 + Math.random() * 1.5) : c.baseline
          const current = noise(target)
          const history = [...c.history, current].slice(-WINDOW)
          const baseline = spiking
            ? c.baseline // freeze baseline learning during attack so anomaly stays visible
            : Math.round(EWMA_ALPHA * current + (1 - EWMA_ALPHA) * c.baseline)
          const predicted = predictNext(history, baseline)
          return { ...c, current, baseline, predicted, history, spikeTicks: Math.max(0, c.spikeTicks - 1) }
        }),
      )
      setTimeline((prev) => [...prev, { t: tickRef.current }].slice(-WINDOW))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running])

  // Write each client's current rate into the latest timeline point.
  useEffect(() => {
    setTimeline((prev) => {
      if (prev.length === 0) return prev
      const copy = [...prev]
      const point = { ...copy[copy.length - 1] }
      clients.forEach((c: ClientState) => {
        point[c.id] = c.current
      })
      copy[copy.length - 1] = point
      return copy
    })
  }, [clients])

  const statuses = useMemo(() => clients.map(statusOf), [clients])
  const anomalies = statuses.filter((s) => s === 'ANOMALY').length
  const throttled = statuses.filter((s) => s === 'THROTTLED').length
  const totalRpm = clients.reduce((s, c) => s + c.current, 0)
  const predictedRpm = clients.reduce((s, c) => s + c.predicted, 0)

  const injectSpike = () => {
    setClients((prev) => {
      // Pick the lowest-traffic client so the spike is dramatic.
      const idx = prev.reduce((min, c, i, arr) => (c.baseline < arr[min].baseline ? i : min), 0)
      return prev.map((c, i) => (i === idx ? { ...c, spikeTicks: 6 } : c))
    })
    setRunning(true)
  }

  const reset = () => {
    setClients(INITIAL.map((c) => ({ ...c, history: [] })))
    setTimeline([])
    tickRef.current = 0
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-[var(--background)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--muted)] px-2.5 py-1 text-xs font-medium text-[var(--muted-foreground)]">
              <Gauge className="h-3.5 w-3.5" /> ML Gateway Security
            </span>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--foreground)]">
              Abnormal API usage detection &amp; predictive throttling
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
              The gateway learns each client&apos;s normal request rate, predicts the next window&apos;s load, and
              throttles clients <strong>before</strong> a spike turns into a denial-of-service event.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={injectSpike}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
            >
              <Zap className="h-4 w-4" /> Simulate DoS spike
            </button>
            <button
              onClick={() => setRunning((r) => !r)}
              className="inline-flex items-center gap-2 rounded-lg border bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg border bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
        {['Request received', 'Per-client rate metering', 'EWMA baseline (ML)', 'Load prediction', 'Predictive throttle'].map(
          (step, i, arr) => (
            <span key={step} className="flex items-center gap-2">
              <span className="rounded-md border bg-[var(--background)] px-2.5 py-1 font-medium text-[var(--foreground)]">
                {step}
              </span>
              {i < arr.length - 1 ? <span>&rarr;</span> : null}
            </span>
          ),
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total req/min" value={totalRpm} icon={Activity} sub="across all clients" />
        <StatCard
          label="Predicted next"
          value={predictedRpm}
          icon={TrendingUp}
          tone={predictedRpm > totalRpm ? 'warn' : 'default'}
          sub="short-horizon forecast"
        />
        <StatCard label="Abnormal clients" value={anomalies} icon={AlertTriangle} tone={anomalies ? 'warn' : 'ok'} sub="rate above learned baseline" />
        <StatCard label="Throttled" value={throttled} icon={ShieldCheck} tone={throttled ? 'danger' : 'ok'} sub="pre-emptively rate-limited" />
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-[var(--background)] p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Per-client request rate (live)</h3>
          <span className="text-xs text-[var(--muted-foreground)]">one line per client · dashed red = per-client limit ({RATE_LIMIT}/min)</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                y={RATE_LIMIT}
                stroke="#ef4444"
                strokeDasharray="6 4"
                label={{ value: `limit ${RATE_LIMIT}`, position: 'right', fontSize: 10, fill: '#ef4444' }}
              />
              {clients.map((c: ClientState) => (
                <Line
                  key={c.id}
                  type="monotone"
                  dataKey={c.id}
                  name={c.label}
                  stroke={CLIENT_COLORS[c.id]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-client table */}
      <div className="rounded-xl border bg-[var(--background)] shadow-sm">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Per-client traffic &amp; enforcement</h3>
        </div>
        <div className="divide-y">
          {clients.map((c: ClientState, i: number) => {
            const st = statuses[i]
            const cfg = STATUS_CFG[st]
            const pct = Math.min(100, Math.round((c.current / RATE_LIMIT) * 100))
            const barColor = st === 'THROTTLED' ? 'bg-red-500' : st === 'ANOMALY' ? 'bg-amber-500' : 'bg-emerald-500'
            return (
              <div key={c.id} className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm">
                <div className="col-span-3 font-medium text-[var(--foreground)]">
                  {c.label}
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">{c.id}</span>
                </div>
                <div className="col-span-4">
                  <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                    <span>{c.current}/min</span>
                    <span>baseline {c.baseline}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                    <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="col-span-2 text-xs text-[var(--muted-foreground)]">
                  predicted <span className="font-semibold text-[var(--foreground)]">{c.predicted}</span>/min
                </div>
                <div className="col-span-3 flex justify-end">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        How it works: each client&apos;s normal rate is learned with an exponentially-weighted moving average. A
        short-horizon forecast extrapolates the recent trend; when the forecast exceeds the per-client limit
        ({RATE_LIMIT}/min) the gateway throttles the client pre-emptively — stopping a DoS spike before it lands.
      </p>
    </div>
  )
}
