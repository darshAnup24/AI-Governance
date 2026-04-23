<<<<<<< HEAD
import { useState } from 'react'
import { Search, Zap } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import govApi from '../../lib/govApi'

const sampleThreats = [
    { id: '1', patternType: 'prompt_injection_jailbreak', severity: 'CRITICAL', detectedAt: '2024-06-01T10:23:00Z', status: 'ACTIVE', details: { matchedText: 'ignore previous instructions', confidence: 0.95 } },
    { id: '2', patternType: 'regulatory_gdpr', severity: 'HIGH', detectedAt: '2024-06-01T09:45:00Z', status: 'ACTIVE', details: { matchedText: 'personal data without consent', confidence: 0.88 } },
    { id: '3', patternType: 'security_sql_injection', severity: 'CRITICAL', detectedAt: '2024-06-01T08:12:00Z', status: 'MITIGATED', details: { matchedText: 'f"SELECT * FROM users WHERE id={user_id}"', confidence: 0.92 } },
    { id: '4', patternType: 'hallucination_fake_citation', severity: 'MEDIUM', detectedAt: '2024-05-31T15:30:00Z', status: 'ACTIVE', details: { matchedText: 'Smith et al. (2023)', confidence: 0.75 } },
    { id: '5', patternType: 'bias_gender', severity: 'HIGH', detectedAt: '2024-05-31T14:00:00Z', status: 'ACTIVE', details: { matchedText: 'female engineer', confidence: 0.65 } },
]

const categoryData = [
    { name: 'Prompt Injection', value: 35, color: '#ef4444' },
    { name: 'Security', value: 25, color: '#f97316' },
    { name: 'Regulatory', value: 20, color: '#eab308' },
    { name: 'Hallucination', value: 12, color: '#22c55e' },
    { name: 'Bias', value: 8, color: '#3b82f6' },
]

const sevColors: Record<string, string> = {
    CRITICAL: 'bg-red-500/10 text-red-400', HIGH: 'bg-orange-500/10 text-orange-400',
    MEDIUM: 'bg-yellow-500/10 text-yellow-400', LOW: 'bg-emerald-500/10 text-emerald-400'
}

export default function ThreatDetection() {
    const [threats] = useState(sampleThreats)
    const [scanText, setScanText] = useState('')
    const [scanResult, setScanResult] = useState<any>(null)
    const [scanning, setScanning] = useState(false)

    const handleScan = async () => {
        if (!scanText.trim()) return
        setScanning(true)
        try {
            const r = await govApi.post('/api/threats/scan', { text: scanText })
            setScanResult(r.data)
        } catch {
            setScanResult({ riskScore: 0, action: 'ALLOW', threatsDetected: 0, euAiActRiskLevel: 'MINIMAL' })
        }
        setScanning(false)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-100">Threat Detection</h1>

            {/* Manual Scan */}
            <div className="card border border-brand-500/20 bg-brand-500/5">
                <h3 className="text-sm font-semibold text-brand-400 mb-3 flex items-center gap-2">
                    <Search className="w-4 h-4" /> Manual Scan
                </h3>
                <textarea
                    className="input w-full h-28 font-mono text-sm mb-3"
                    placeholder="Paste any text to scan for threats..."
                    value={scanText}
                    onChange={e => setScanText(e.target.value)}
                />
                <div className="flex items-center gap-4">
                    <button onClick={handleScan} disabled={scanning} className="btn-primary flex items-center gap-2">
                        {scanning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                        {scanning ? 'Scanning...' : 'Scan'}
                    </button>
                    {scanResult && (
                        <div className="flex gap-4 text-sm">
                            <span className={scanResult.riskScore >= 70 ? 'text-red-400' : scanResult.riskScore >= 40 ? 'text-yellow-400' : 'text-emerald-400'}>
                                Risk: <strong>{scanResult.riskScore}</strong>
                            </span>
                            <span className="text-slate-400">Action: <strong>{scanResult.action}</strong></span>
                            <span className="text-slate-400">EU AI Act: <strong>{scanResult.euAiActRiskLevel}</strong></span>
                            <span className="text-slate-400">Threats: <strong>{scanResult.threatsDetected}</strong></span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Category Donut */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">By Category</h2>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                                {categoryData.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-1">
                        {categoryData.map(d => (
                            <div key={d.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                                    <span className="text-slate-400">{d.name}</span>
                                </div>
                                <span className="text-slate-300">{d.value}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Threat Table */}
                <div className="card lg:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">Recent Threats</h2>
                    <div className="space-y-2">
                        {threats.map(t => (
                            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${sevColors[t.severity]}`}>{t.severity}</span>
                                        <code className="text-xs text-slate-400">{t.patternType}</code>
                                    </div>
                                    <p className="text-xs text-slate-500 font-mono truncate max-w-md">"{t.details.matchedText}"</p>
                                </div>
                                <div className="text-right text-xs">
                                    <p className="text-slate-500">{new Date(t.detectedAt).toLocaleDateString()}</p>
                                    <p className={t.status === 'ACTIVE' ? 'text-red-400' : 'text-emerald-400'}>{t.status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
=======
import { useState, useEffect, useRef } from 'react'
import { Search, Zap, RefreshCw, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useAuditEvents, useDetectionBreakdown } from '../../lib/hooks'
import { SkeletonTable } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'
import govApi from '../../lib/govApi'

const ACTION_COLORS: Record<string, string> = {
  BLOCK: 'bg-red-500/10 text-red-400',
  REDACT: 'bg-orange-500/10 text-orange-400',
  WARN: 'bg-yellow-500/10 text-yellow-400',
  LOG: 'bg-blue-500/10 text-blue-400',
  ALLOW: 'bg-emerald-500/10 text-emerald-400',
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
    try {
      const r = await govApi.post('/api/threats/scan', { text: scanText })
      setScanResult(r.data)
    } catch {
      // Mock scan result for demo
      const score = Math.floor(Math.random() * 100)
      setScanResult({
        riskScore: score,
        action: score >= 90 ? 'BLOCK' : score >= 80 ? 'REDACT' : score >= 60 ? 'WARN' : score >= 30 ? 'LOG' : 'ALLOW',
        threatsDetected: Math.floor(score / 20),
        euAiActRiskLevel: score >= 90 ? 'UNACCEPTABLE' : score >= 70 ? 'HIGH' : score >= 40 ? 'LIMITED' : 'MINIMAL',
      })
    }
    setScanning(false)
  }

  const filteredEvents = (events ?? []).filter(
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
        <h3 className="text-sm font-semibold text-brand-400 mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" /> Manual Scan
        </h3>
        <textarea
          id="scan-textarea"
          className="input w-full h-28 font-mono text-sm mb-3 resize-none"
          placeholder="Paste any text to scan for threats... (e.g. an API key, sensitive email, code snippet)"
          value={scanText}
          onChange={e => setScanText(e.target.value)}
        />
        <div className="flex items-center gap-4 flex-wrap">
          <button
            id="scan-btn"
            onClick={handleScan}
            disabled={scanning || !scanText.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {scanning
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Zap className="w-4 h-4" />}
            {scanning ? 'Scanning...' : 'Scan Prompt'}
          </button>

          {scanResult && (
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Risk Score</span>
                <span className={`text-lg font-bold ${scanResult.riskScore >= 70 ? 'text-red-400' : scanResult.riskScore >= 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                  {scanResult.riskScore}
                </span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">Action</span>
                <span className={`font-semibold text-xs px-2 py-0.5 rounded ${ACTION_COLORS[scanResult.action]}`}>
                  {scanResult.action}
                </span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">EU AI Act</span>
                <span className={`font-semibold text-xs ${TIER_COLORS[scanResult.euAiActRiskLevel]}`}>
                  {scanResult.euAiActRiskLevel} RISK
                </span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">Threats</span>
                <span className="text-slate-200 font-semibold">{scanResult.threatsDetected}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts + Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Donut */}
        <div className="card">
          <h2 className="text-base font-semibold text-slate-100 mb-4">By Category</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={breakdown ?? []}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {(breakdown ?? []).map((d: any, i: number) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {(breakdown ?? []).map((d: any) => (
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
      {(events ?? []).some((e: any) => e.action === 'BLOCK') && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">Active Block Events Detected</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {(events ?? []).filter((e: any) => e.action === 'BLOCK').length} requests were blocked in this session.
              Review the feed above for details.
            </p>
          </div>
        </div>
      )}
    </div>
  )
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
}
