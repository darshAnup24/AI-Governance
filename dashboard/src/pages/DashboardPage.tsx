import { useState, useEffect, useRef } from 'react'
import {
  Shield, AlertTriangle, Eye, Activity, CheckCircle,
  Zap, Server, Clock, Filter, RefreshCw, XCircle,
  BarChart3, Gauge, Radio, Wifi, HardDrive, Layers,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { useAnalyticsTrend, useAuditEvents, useProxyStats,
  useLatencyPercentiles, useRedisHealth, useUpstreamLatency,
  useQueueDepth, useActiveStreams, useRuntimeMode } from '../lib/hooks'
import { useLiveAuditFeed } from '../lib/live'
import { PageHeader, PageShell, StatusPill } from '../components/ui/page-shell'

// ── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  BLOCK:  { color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',     dot: 'bg-red-500',    label: 'BLOCKED'  },
  REDACT: { color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30', dot: 'bg-orange-500', label: 'REDACTED' },
  WARN:   { color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30', dot: 'bg-yellow-500', label: 'WARNED'   },
  ALLOW:  { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-500', label: 'ALLOWED' },
  LOG:    { color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30',    dot: 'bg-blue-500',   label: 'LOGGED'   },
}

function riskColor(score: number) {
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-emerald-400'
}

function riskBg(score: number) {
  if (score >= 75) return 'bg-red-500'
  if (score >= 50) return 'bg-orange-500'
  if (score >= 25) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '—' }
}

function shortHash(h: string) { return h ? h.slice(0, 8) + '…' : '—' }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-3 text-xs shadow-lg">
      <p className="text-[var(--muted-foreground)] mb-1.5 font-medium">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--muted-foreground)]">{p.dataKey}:&nbsp;<strong className="text-[var(--foreground)]">{p.value}</strong></span>
        </div>
      ))}
    </div>
  )
}

// ── Live event feed row ──────────────────────────────────────────────────────

function EventRow({ ev, flash }: { ev: any; flash: boolean }) {
  const meta   = ACTION_META[ev.action_taken] ?? ACTION_META.ALLOW
  const cats   = (ev.detection_results?.detected_spans ?? []).map((s: any) => s.category)
  const score  = ev.risk_score ?? 0

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs transition-colors
      ${flash
        ? 'border-[var(--border)] bg-[var(--muted)]'
        : 'border-transparent hover:bg-[var(--muted)]'
      }`}
    >
      <span className="text-[var(--muted-foreground)]/60 w-20 shrink-0 font-mono tabular-nums">{fmt(ev.timestamp)}</span>
      <div className="w-24 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${riskBg(score)}`} style={{ width: `${score}%` }} />
          </div>
          <span className={`font-mono font-bold w-6 text-right ${riskColor(score)}`}>{score}</span>
        </div>
      </div>
      <span className={`px-2 py-0.5 rounded-full border font-bold text-[10px] shrink-0 ${meta.bg} ${meta.color}`}>
        {meta.label}
      </span>
      <div className="flex gap-1 flex-wrap min-w-0 flex-1">
        {cats.length > 0
          ? cats.slice(0, 3).map((c: string) => (
              <span key={c} className="px-1.5 py-0.5 bg-[var(--muted)] rounded text-[10px] text-[var(--muted-foreground)] font-mono">{c}</span>
            ))
          : <span className="text-[var(--muted-foreground)]/30 text-[10px]">clean</span>
        }
      </div>
      <span className="text-[var(--muted-foreground)]/60 shrink-0 hidden md:block w-20 truncate">{ev.tool_name || '—'}</span>
      <span className="text-[var(--muted-foreground)]/60 shrink-0 hidden lg:block w-18">{ev.llm_provider || '—'}</span>
      <span className="text-[var(--muted-foreground)]/40 font-mono hidden xl:block shrink-0 w-20">{shortHash(ev.prompt_hash)}</span>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const statsQ       = useProxyStats()
  const trendQ       = useAnalyticsTrend(30)
  const eventsQ      = useAuditEvents({ limit: 50 })
  const latencyQ     = useLatencyPercentiles()
  const redisQ       = useRedisHealth()
  const upstreamQ    = useUpstreamLatency()
  const queueDepthQ  = useQueueDepth()
  const streamsQ     = useActiveStreams()
  const runtimeModeQ = useRuntimeMode()
  const liveFeed     = useLiveAuditFeed(50)

  const [filter, setFilter]     = useState<string>('ALL')
  const [flashId, setFlashId]   = useState<string | null>(null)
  const [newCount, setNewCount] = useState(0)
  const lastTopRef              = useRef<string | null>(null)

  const stats       = statsQ.data       ?? {}
  const polledEvents: any[] = Array.isArray(eventsQ.data) ? eventsQ.data : []
  const events: any[] = liveFeed.events.length
    ? liveFeed.events.map((event) => ({
        event_id: event.event_id,
        timestamp: event.timestamp,
        risk_score: event.risk_score ?? 0,
        action_taken: event.action_taken ?? 'ALLOW',
        llm_provider: event.llm_provider ?? '—',
        detection_results: {
          detected_spans: (event.categories || []).map((category) => ({ category })),
        },
      }))
    : polledEvents
  const trend       = trendQ.data       ?? []
  const latency     = latencyQ.data     ?? {}
  const redis       = redisQ.data       ?? { connected: false }
  const upstream    = Array.isArray(upstreamQ.data) ? upstreamQ.data : []
  const queueDepth  = queueDepthQ.data  ?? {}
  const streams     = streamsQ.data     ?? { active_streams: 0 }
  const runtimeMode = runtimeModeQ.data ?? { mode: liveFeed.runtimeMode }

  // Flash newest event when feed updates
  useEffect(() => {
    if (!events.length) return
    const topId = events[0]?.event_id
    if (topId && topId !== lastTopRef.current) {
      if (lastTopRef.current !== null) {
        setFlashId(topId)
        setNewCount(c => c + 1)
        setTimeout(() => setFlashId(null), 1500)
      }
      lastTopRef.current = topId
    }
  }, [events])

  const displayed = filter === 'ALL'
    ? events
    : events.filter(e => e.action_taken === filter)

  const FILTERS = ['ALL', 'BLOCK', 'WARN', 'REDACT', 'ALLOW']

  // Bar chart colors per action
  const BAR_COLORS: Record<string, string> = {
    BLOCK: '#ef4444', WARN: '#eab308', REDACT: '#f97316', ALLOW: '#22c55e', LOG: '#3b82f6',
  }

  return (
    <PageShell>
      <PageHeader
        badge="Proxy Monitor"
        title="Live request stream, audit trail, and risk analytics"
        description="A single operational surface for latency, queue health, runtime posture, and enforcement actions."
        status={<StatusPill label={liveFeed.status === 'connected' ? 'Live Stream' : liveFeed.status.toUpperCase()} tone={liveFeed.status === 'connected' ? 'live' : 'warning'} />}
        actions={
          <div className="flex items-center gap-3">
          {newCount > 0 && (
            <span className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 font-mono text-xs text-[var(--muted-foreground)]">
              +{newCount} new
            </span>
          )}
          <button
            onClick={() => { eventsQ.refetch(); statsQ.refetch(); setNewCount(0) }}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          </div>
        }
      />

      <div className={`rounded-xl border px-4 py-3 text-sm ${
        liveFeed.status === 'connected'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
      }`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-medium">
            Runtime mode: {runtimeMode.mode || liveFeed.runtimeMode || 'STANDARD'}
          </span>
          <span>Stream: {liveFeed.status}</span>
          <span>Active SSE: {liveFeed.activeStreams || streams.active_streams || 0}</span>
          <span>Degraded events: {liveFeed.degradedEvents || runtimeMode.degraded_events || 0}</span>
          <span>Last heartbeat: {liveFeed.lastHeartbeat ? fmt(liveFeed.lastHeartbeat) : 'waiting'}</span>
        </div>
      </div>

      {/* ── KPI row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Today',  value: stats.totalToday   ?? '—', icon: Activity,     color: 'text-[var(--foreground)]' },
          { label: 'Blocked',      value: stats.blockedToday ?? '—',  icon: XCircle,      color: 'text-red-500',     sub: `${stats.blockRate ?? 0}%` },
          { label: 'Warned',       value: stats.warnedToday  ?? '—',  icon: AlertTriangle,color: 'text-amber-500',   sub: `${stats.warnRate ?? 0}%`  },
          { label: 'Redacted',     value: stats.redactedToday?? '—',  icon: Eye,          color: 'text-orange-500',  sub: `${stats.redactRate ?? 0}%`},
          { label: 'Allowed',      value: stats.allowedToday ?? '—',  icon: CheckCircle,  color: 'text-emerald-600' },
          { label: 'Avg Risk',     value: stats.avgRiskScore ?? '—',  icon: Zap,          color: 'text-[var(--foreground)]',   sub: `${stats.highRiskToday ?? 0} high` },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card-hover border border-[var(--border)] bg-[var(--card)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">{label}</span>
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </div>
            {statsQ.isPending
              ? <div className="h-6 w-14 rounded bg-[var(--muted)]" />
              : <span className="text-xl font-semibold text-[var(--foreground)]">{value}</span>
            }
            {sub && !statsQ.isPending && (
              <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{sub} of total</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Extended KPI row (latency, queue depth, Redis, streams) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="card-hover border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">p50/p95/p99 (ms)</span>
            <BarChart3 className="h-3.5 w-3.5 text-[var(--foreground)]" />
          </div>
          {latencyQ.isPending ? (
            <div className="h-6 w-20 rounded bg-[var(--muted)]" />
          ) : (
            <div className="flex gap-3">
              <span className="text-xs font-mono text-[var(--muted-foreground)]">50: <strong className="text-[var(--foreground)]">{latency.p50 ?? '—'}</strong></span>
              <span className="text-xs font-mono text-[var(--muted-foreground)]">95: <strong className="text-[var(--foreground)]">{latency.p95 ?? '—'}</strong></span>
              <span className="text-xs font-mono text-[var(--muted-foreground)]">99: <strong className="text-[var(--foreground)]">{latency.p99 ?? '—'}</strong></span>
            </div>
          )}
        </div>

        <div className="card-hover border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Redis</span>
            <HardDrive className={`h-3.5 w-3.5 ${redis.connected ? 'text-emerald-600' : 'text-red-500'}`} />
          </div>
          {redisQ.isPending ? (
            <div className="h-6 w-20 rounded bg-[var(--muted)]" />
          ) : (
            <div className="text-xs">
              <span className={`font-semibold ${redis.connected ? 'text-emerald-600' : 'text-red-500'}`}>
                {redis.connected ? 'Connected' : 'Disconnected'}
              </span>
              <p className="text-[var(--muted-foreground)]/70 mt-0.5 font-mono">
                {redis.hit_rate ?? 0}% hit · {redis.uptime_seconds ? `${Math.floor(redis.uptime_seconds / 3600)}h` : '—'}
              </p>
            </div>
          )}
        </div>

        <div className="card-hover border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Queue Depth</span>
            <Layers className="h-3.5 w-3.5 text-[var(--foreground)]" />
          </div>
          {queueDepthQ.isPending ? (
            <div className="h-6 w-14 rounded bg-[var(--muted)]" />
          ) : (
            <div className="text-xs">
              <span className="text-xl font-semibold text-[var(--foreground)]">{queueDepth.audit_queue ?? 0}</span>
              <p className="text-[var(--muted-foreground)]/70 mt-0.5 font-mono">
                DL: {queueDepth.dead_letter_queue ?? 0} · Lag: {queueDepth.consumer_lag ?? 0}
              </p>
            </div>
          )}
        </div>

        <div className="card-hover border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Active Streams</span>
            <Radio className="h-3.5 w-3.5 text-[var(--foreground)]" />
          </div>
          {streamsQ.isPending ? (
            <div className="h-6 w-10 rounded bg-[var(--muted)]" />
          ) : (
            <div className="text-xs">
              <span className="text-xl font-semibold text-[var(--foreground)]">
                {liveFeed.activeStreams || streams.active_streams || 0}
              </span>
              <p className="text-[var(--muted-foreground)]/70 mt-0.5">SSE connections</p>
            </div>
          )}
        </div>

        <div className="card-hover border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Sample Count</span>
            <Gauge className="h-3.5 w-3.5 text-[var(--foreground)]" />
          </div>
          {latencyQ.isPending ? (
            <div className="h-6 w-14 rounded bg-[var(--muted)]" />
          ) : (
            <div className="text-xs">
              <span className="text-xl font-semibold text-[var(--foreground)]">{latency.sample_count ?? 0}</span>
              <p className="text-[var(--muted-foreground)]/70 mt-0.5">last 1h samples</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Charts row ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* 30-day stacked area */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Risk Trend — Last 30 Days</h2>
              <p className="text-[10px] text-[var(--muted-foreground)]/70 mt-0.5">Daily ALLOW / WARN / REDACT / BLOCK from audit log</p>
            </div>
            <Server className="w-4 h-4 text-[var(--muted-foreground)]/70" />
          </div>
          {trendQ.isPending ? (
            <div className="h-44 rounded-lg bg-[var(--muted)]/50" />
          ) : trend.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-[var(--muted-foreground)]/70 text-xs gap-2">
              <Clock className="w-5 h-5 opacity-40" /> No trend data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  {Object.entries(BAR_COLORS).map(([k, c]) => (
                    <linearGradient key={k} id={`mg-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={c} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#475569" fontSize={9} tickFormatter={v => v?.slice(5) ?? ''} />
                <YAxis stroke="#475569" fontSize={9} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                {Object.entries(BAR_COLORS).map(([k, c]) => (
                  <Area key={k} type="monotone" dataKey={k}
                    stroke={c} fill={`url(#mg-${k})`} strokeWidth={1.5}
                    dot={false} activeDot={{ r: 3 }} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Today's action bar */}
        <div className="card">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">Today's Breakdown</h2>
          <p className="text-[10px] text-[var(--muted-foreground)]/70 mb-4">Actions taken in last 24 h</p>
          {statsQ.isPending ? (
            <div className="h-44 rounded-lg bg-[var(--muted)]/50" />
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <BarChart
                layout="vertical"
                data={[
                  { name: 'ALLOW',  value: stats.allowedToday  ?? 0, fill: '#22c55e' },
                  { name: 'WARN',   value: stats.warnedToday   ?? 0, fill: '#eab308' },
                  { name: 'REDACT', value: stats.redactedToday ?? 0, fill: '#f97316' },
                  { name: 'BLOCK',  value: stats.blockedToday  ?? 0, fill: '#ef4444' },
                  { name: 'LOG',    value: stats.loggedToday   ?? 0, fill: '#3b82f6' },
                ]}
                margin={{ left: 8, right: 8, top: 0, bottom: 0 }}
              >
                <XAxis type="number" stroke="#475569" fontSize={9} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="#475569" fontSize={9} width={42} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {[
                    { fill: '#22c55e' }, { fill: '#eab308' },
                    { fill: '#f97316' }, { fill: '#ef4444' }, { fill: '#3b82f6' },
                  ].map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Upstream provider latency ─────────────────────────── */}
      {upstream.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-4 h-4 text-[var(--muted-foreground)]/70" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Upstream Provider Latency (24h)</h2>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={upstream} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="provider" stroke="#475569" fontSize={9} />
              <YAxis stroke="#475569" fontSize={9} unit=" ms" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="avg_latency_ms" name="Avg" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="p95_latency_ms" name="p95" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Live feed ─────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Live Request Feed</h2>
            <span className="text-[10px] text-[var(--muted-foreground)]/70">
              ({events.length} loaded · {liveFeed.status})
            </span>
          </div>

          {/* Filters */}
          <div className="flex gap-1">
            <Filter className="w-3.5 h-3.5 text-[var(--muted-foreground)]/70 self-center mr-1" />
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                  filter === f
                    ? (f === 'ALL'
                        ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'
                        : `${ACTION_META[f]?.bg ?? ''} ${ACTION_META[f]?.color ?? ''}`)
                    : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)]/70 hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-3 pb-1.5 border-b border-[var(--border)] text-[9px] text-[var(--muted-foreground)]/70 uppercase tracking-wider font-medium">
          <span className="w-20 shrink-0">Time</span>
          <span className="w-24 shrink-0">Risk</span>
          <span className="w-16 shrink-0">Action</span>
          <span className="flex-1">Categories</span>
          <span className="w-20 shrink-0 hidden md:block">Tool</span>
          <span className="w-18 shrink-0 hidden lg:block">Provider</span>
          <span className="w-20 shrink-0 hidden xl:block">Hash</span>
        </div>

        {/* Rows */}
        <div className="space-y-0.5 mt-1 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
          {eventsQ.isPending ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="mx-2 h-9 rounded-lg bg-[var(--muted)]/40" />
            ))
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--muted-foreground)]/70">
              <Shield className="w-10 h-10 opacity-20" />
              <p className="text-sm">No events yet — send a prompt through the proxy to see live data here</p>
            </div>
          ) : (
            displayed.map(ev => (
              <EventRow key={ev.event_id} ev={ev} flash={ev.event_id === flashId} />
            ))
          )}
        </div>
      </div>
    </PageShell>
  )
}
