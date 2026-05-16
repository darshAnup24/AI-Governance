import { useState, useEffect, useRef } from 'react'
import { Search, Zap, RefreshCw, AlertTriangle, ShieldAlert, ShieldCheck, ExternalLink, ChevronRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useAuditEvents, useDetectionBreakdown } from '../../lib/hooks'
import { SkeletonTable } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'
import api from '../../lib/api'
import { Link } from 'react-router-dom'

const ACTION_COLORS: Record<string, string> = {
  BLOCK: 'bg-red-500/10 text-red-400',
  REDACT: 'bg-orange-500/10 text-orange-400',
  WARN: 'bg-yellow-500/10 text-yellow-400',
  LOG: 'bg-blue-500/10 text-blue-400',
  ALLOW: 'bg-emerald-500/10 text-emerald-400',
}

const CATEGORY_COLORS: Record<string, string> = {
  PII: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  PROMPT_INJECTION: 'bg-red-500/10 text-red-300 border-red-500/30',
  API_KEY: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  CREDENTIALS: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  REGULATORY: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  SECURITY_VULN: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  CONFIDENTIAL: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  SOURCE_CODE: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
}

function euAiActLevel(score: number): string {
  if (score >= 90) return 'UNACCEPTABLE'
  if (score >= 70) return 'HIGH'
  if (score >= 40) return 'LIMITED'
  return 'MINIMAL'
}

const TIER_COLORS: Record<string, string> = {
  UNACCEPTABLE: 'text-red-400',
  HIGH: 'text-orange-400',
  LIMITED: 'text-yellow-400',
  MINIMAL: 'text-emerald-400',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

// ── Live Feed ─────────────────────────────────────────────────────────────────

function LiveFeed({ events }: { events: any[] }) {
  const listRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [events, autoScroll])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <h2 className="text-base font-semibold text-slate-100">Live Threat Feed</h2>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="accent-brand-500 w-3 h-3" />
          Auto-scroll
        </label>
      </div>
      <div ref={listRef} className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {events.map((evt: any, i: number) => (
          <div
            key={evt.id}
            className={`flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors ${i === 0 ? 'border border-brand-500/10' : ''}`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {evt.action === 'BLOCK' || evt.action === 'REDACT'
                ? <ShieldAlert className="w-4 h-4 text-red-400" />
                : <ShieldCheck className="w-4 h-4 text-emerald-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${ACTION_COLORS[evt.action]}`}>
                  {evt.action}
                </span>
                <span className="text-xs text-slate-500">{evt.userName}</span>
                {evt.detectedCategories?.map((c: string) => (
                  <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{c}</span>
                ))}
              </div>
              <p className="text-xs text-slate-500 font-mono mt-1 truncate">{evt.promptPreview}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-xs font-bold ${evt.riskScore >= 70 ? 'text-red-400' : evt.riskScore >= 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {evt.riskScore}
              </p>
              <p className="text-[10px] text-slate-600">{timeAgo(evt.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ThreatDetection() {
  const { data: events, isPending, isError, refetch, isFetching } = useAuditEvents({ limit: 50 })
  const { data: breakdown } = useDetectionBreakdown()

  const [scanText, setScanText] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [filterAction, setFilterAction] = useState<string>('ALL')

  // Auto-refresh every 10s
  useEffect(() => {
    const timer = setInterval(() => refetch(), 10_000)
    return () => clearInterval(timer)
  }, [refetch])

  const handleScan = async () => {
    if (!scanText.trim()) return
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    try {
      const r = await api.post('/api/v1/inspect', { text: scanText })
      const d = r.data
      setScanResult({
        riskScore: d.risk_score ?? 0,
        action: d.action ?? 'ALLOW',
        categories: d.categories ?? [],
        detectedSpans: d.detected_spans ?? [],
        euAiActRiskLevel: euAiActLevel(d.risk_score ?? 0),
        threatsDetected: (d.detected_spans ?? []).length,
        durationMs: d.duration_ms ?? 0,
      })
    } catch (e: any) {
      setScanError(e?.response?.data?.detail || 'Detection service unavailable — ensure containers are running.')
    }
    setScanning(false)
  }

  const eventList = Array.isArray(events) ? events : []
  const breakdownList = Array.isArray(breakdown) ? breakdown : []

  const normalizedEvents = eventList.map((e: any) => ({
    ...e,
    action: e.action ?? e.action_taken ?? 'ALLOW',
    riskScore: e.riskScore ?? e.risk_score ?? 0,
    createdAt: e.createdAt ?? e.timestamp ?? new Date().toISOString(),
    userName: e.userName ?? e.user_id ?? 'unknown-user',
    detectedCategories: e.detectedCategories ?? e.detection_results?.detected_spans?.map((s: any) => s.category) ?? [],
    promptPreview: e.promptPreview ?? e.prompt_preview ?? e.prompt ?? '',
  }))

  const filteredEvents = normalizedEvents.filter(
    (e: any) => filterAction === 'ALL' || e.action === filterAction
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Threat Detection</h1>
          <p className="text-slate-500 text-sm mt-0.5">Real-time prompt risk monitoring</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isError && <InlineError message="Live feed unavailable — using cached data." onRetry={() => refetch()} />}

      {/* Manual Scan */}
      <div className="card border border-brand-500/20 bg-brand-500/3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-brand-400 flex items-center gap-2">
            <Search className="w-4 h-4" /> Quick Threat Scan
          </h3>
          <Link
            to="/live-demo"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-400 transition-colors"
          >
            Deep span analysis
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <textarea
          id="scan-textarea"
          className="input w-full h-28 font-mono text-sm mb-3 resize-none"
          placeholder="Paste any text to scan for threats... (e.g. an API key, sensitive email, code snippet)"
          value={scanText}
          onChange={e => setScanText(e.target.value)}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            id="scan-btn"
            onClick={handleScan}
            disabled={scanning || !scanText.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {scanning
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Zap className="w-4 h-4" />}
            {scanning ? 'Scanning...' : 'Scan'}
          </button>

          {scanError && (
            <p className="text-xs text-red-400">⚠ {scanError}</p>
          )}
        </div>

        {scanResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 animate-fade-in">
            {/* Top metrics row */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs">Risk Score</span>
                <span className={`text-2xl font-bold font-mono ${
                  scanResult.riskScore >= 70 ? 'text-red-400' :
                  scanResult.riskScore >= 40 ? 'text-yellow-400' : 'text-emerald-400'
                }`}>{scanResult.riskScore}</span>
              </div>
              <div>
                <span className={`font-semibold text-xs px-2.5 py-1 rounded-full border ${
                  ACTION_COLORS[scanResult.action]
                }`}>{scanResult.action}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-xs">EU AI Act</span>
                <span className={`font-bold text-xs ${TIER_COLORS[scanResult.euAiActRiskLevel]}`}>
                  {scanResult.euAiActRiskLevel}
                </span>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[10px] text-slate-600 font-mono">{scanResult.durationMs}ms</p>
                <p className="text-[10px] text-slate-600">{scanResult.threatsDetected} span{scanResult.threatsDetected !== 1 ? 's' : ''} found</p>
              </div>
            </div>

            {/* Detected categories */}
            {scanResult.categories.length > 0 ? (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Detected Categories</p>
                <div className="flex flex-wrap gap-2">
                  {scanResult.categories.map((cat: string) => (
                    <span key={cat}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                        CATEGORY_COLORS[cat] || 'bg-slate-700/50 text-slate-300 border-slate-700'
                      }`}
                    >
                      <ChevronRight className="w-3 h-3" />
                      {cat.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <ShieldCheck className="w-4 h-4" />
                No violations detected
              </div>
            )}

            {/* Top span details */}
            {scanResult.detectedSpans.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                {scanResult.detectedSpans.slice(0, 4).map((sp: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        sp.category === 'PROMPT_INJECTION' ? 'bg-red-400' :
                        sp.category === 'PII' ? 'bg-blue-400' :
                        sp.category === 'API_KEY' ? 'bg-orange-400' :
                        sp.category === 'REGULATORY' ? 'bg-purple-400' :
                        sp.category === 'SECURITY_VULN' ? 'bg-rose-400' : 'bg-yellow-400'
                      }`} />
                      <span className="text-slate-400">{sp.category?.replace(/_/g, ' ')}</span>
                      {sp.matched_text && (
                        <code className="text-[10px] text-slate-600 bg-slate-800 px-1 rounded truncate max-w-40">
                          {sp.matched_text.slice(0, 28)}…
                        </code>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-500 to-red-500 rounded-full"
                          style={{ width: `${Math.round((sp.confidence || 1) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono w-7 text-right">
                        {Math.round((sp.confidence || 1) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
                {scanResult.detectedSpans.length > 4 && (
                  <Link to="/live-demo" className="text-[10px] text-brand-400 hover:underline flex items-center gap-1">
                    +{scanResult.detectedSpans.length - 4} more spans — view full breakdown
                    <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Charts + Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Donut */}
        <div className="card">
          <h2 className="text-base font-semibold text-slate-100 mb-4">By Category</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={breakdownList}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {breakdownList.map((d: any, i: number) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {breakdownList.map((d: any) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-400">{d.name}</span>
                </div>
                <span className="text-slate-300 font-medium">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Feed */}
        <div className="card lg:col-span-2">
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {['ALL', 'BLOCK', 'REDACT', 'WARN', 'LOG', 'ALLOW'].map(a => (
              <button
                key={a}
                onClick={() => setFilterAction(a)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  filterAction === a
                    ? a === 'ALL'
                      ? 'bg-brand-500/20 text-brand-400 border-brand-500/40'
                      : ACTION_COLORS[a] + ' border-current'
                    : 'text-slate-600 border-slate-700 hover:border-slate-600'
                }`}
              >
                {a}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-600">{filteredEvents.length} events</span>
          </div>

          {isPending ? (
            <SkeletonTable rows={6} />
          ) : (
            <LiveFeed events={filteredEvents} />
          )}
        </div>
      </div>

      {/* High risk alert banner */}
      {normalizedEvents.some((e: any) => e.action === 'BLOCK') && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">Active Block Events Detected</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {normalizedEvents.filter((e: any) => e.action === 'BLOCK').length} requests were blocked in this session.
              Review the feed above for details.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
