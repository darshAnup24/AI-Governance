import { useState } from 'react'
import {
  Download, Loader2, FileText, CheckCircle2, AlertCircle,
  XCircle, ChevronRight, BarChart3, FileDown, RefreshCw,
} from 'lucide-react'
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import govApi from '../../lib/govApi'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Framework {
  id: string
  name: string
  shortName: string
  score: number
  status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT'
  lastAudit: string
  articles: { id: string; name: string; status: 'pass' | 'fail' | 'partial' }[]
  color: string
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

const FRAMEWORKS: Framework[] = [
  {
    id: 'GDPR', name: 'General Data Protection Regulation', shortName: 'GDPR',
    score: 81, status: 'COMPLIANT', lastAudit: '2026-04-01', color: '#22c55e',
    articles: [
      { id: 'Art.5', name: 'Data minimisation', status: 'pass' },
      { id: 'Art.13', name: 'Transparency', status: 'pass' },
      { id: 'Art.17', name: 'Right to erasure', status: 'partial' },
      { id: 'Art.25', name: 'Privacy by design', status: 'pass' },
      { id: 'Art.30', name: 'Records of processing', status: 'pass' },
      { id: 'Art.32', name: 'Security of processing', status: 'pass' },
      { id: 'Art.33', name: 'Breach notification', status: 'partial' },
      { id: 'Art.35', name: 'DPIA for high-risk', status: 'fail' },
    ],
  },
  {
    id: 'HIPAA', name: 'Health Insurance Portability and Accountability Act', shortName: 'HIPAA',
    score: 73, status: 'PARTIAL', lastAudit: '2026-03-15', color: '#eab308',
    articles: [
      { id: '§164.308', name: 'Administrative safeguards', status: 'pass' },
      { id: '§164.310', name: 'Physical safeguards', status: 'pass' },
      { id: '§164.312', name: 'Technical safeguards', status: 'partial' },
      { id: '§164.314', name: 'Org requirements', status: 'partial' },
      { id: '§164.316', name: 'Policies & procedures', status: 'fail' },
    ],
  },
  {
    id: 'EU_AI_ACT', name: 'EU AI Act', shortName: 'EU AI Act',
    score: 68, status: 'PARTIAL', lastAudit: '2026-04-10', color: '#3b82f6',
    articles: [
      { id: 'Art.9', name: 'Risk management system', status: 'pass' },
      { id: 'Art.10', name: 'Data governance', status: 'partial' },
      { id: 'Art.11', name: 'Technical documentation', status: 'partial' },
      { id: 'Art.12', name: 'Record-keeping', status: 'pass' },
      { id: 'Art.13', name: 'Transparency & user info', status: 'pass' },
      { id: 'Art.14', name: 'Human oversight', status: 'fail' },
      { id: 'Art.15', name: 'Accuracy/robustness', status: 'partial' },
    ],
  },
  {
    id: 'RBI', name: 'Reserve Bank of India — Data Localisation', shortName: 'RBI',
    score: 54, status: 'NON_COMPLIANT', lastAudit: '2026-02-20', color: '#ef4444',
    articles: [
      { id: 'Circular-1', name: 'Payment data localisation', status: 'fail' },
      { id: 'Circular-2', name: 'Audit trail requirements', status: 'partial' },
      { id: 'Circular-3', name: 'Reporting to RBI', status: 'fail' },
    ],
  },
]

const COMPLIANCE_TREND = Array.from({ length: 12 }, (_, i) => ({
  month: new Date(2025, i + 4, 1).toLocaleString('default', { month: 'short' }),
  GDPR: Math.min(100, 60 + i * 2 + Math.floor(Math.random() * 5)),
  HIPAA: Math.min(100, 55 + i * 1.5 + Math.floor(Math.random() * 6)),
  EU_AI_ACT: Math.min(100, 45 + i * 2.5 + Math.floor(Math.random() * 7)),
  RBI: Math.min(100, 30 + i * 2 + Math.floor(Math.random() * 4)),
}))

const STATUS_ICON = {
  COMPLIANT: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
  PARTIAL: <AlertCircle className="w-5 h-5 text-yellow-400" />,
  NON_COMPLIANT: <XCircle className="w-5 h-5 text-red-400" />,
}
const STATUS_TEXT = {
  COMPLIANT: 'text-emerald-400',
  PARTIAL: 'text-yellow-400',
  NON_COMPLIANT: 'text-red-400',
}
const ARTICLE_ICON = {
  pass: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />,
  partial: <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />,
  fail: <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />,
}

// ── Score Gauge ────────────────────────────────────────────────────────────────

function ScoreGauge({ score, color, size = 100 }: { score: number; color: string; size?: number }) {
  const data = [{ value: score, fill: color }, { value: 100 - score, fill: 'transparent' }]
  return (
    <div style={{ width: size, height: size / 1.4 }} className="relative">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%" cy="85%"
          innerRadius="65%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          data={data}
          barSize={10}
        >
          <RadialBar background={{ fill: '#1e293b' }} dataKey="value" cornerRadius={5} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <span className="text-lg font-bold" style={{ color }}>{score}%</span>
      </div>
    </div>
  )
}

// ── Report Preview Modal ───────────────────────────────────────────────────────

function ReportPreview({ fw, onClose }: { fw: Framework; onClose: () => void }) {
  const pass = fw.articles.filter(a => a.status === 'pass').length
  const partial = fw.articles.filter(a => a.status === 'partial').length
  const fail = fw.articles.filter(a => a.status === 'fail').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-brand-400" />
            <div>
              <h2 className="text-base font-bold text-slate-100">{fw.shortName} Compliance Report</h2>
              <p className="text-xs text-slate-500">Generated {new Date().toLocaleString()}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Score summary */}
          <div className="flex items-center gap-8 p-4 rounded-xl bg-slate-800/50">
            <ScoreGauge score={fw.score} color={fw.color} size={110} />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {STATUS_ICON[fw.status]}
                <span className={`text-sm font-semibold ${STATUS_TEXT[fw.status]}`}>
                  {fw.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-500">Last audit: {fw.lastAudit}</p>
              <div className="flex gap-4 text-xs mt-3">
                <span className="text-emerald-400">✓ {pass} pass</span>
                <span className="text-yellow-400">~ {partial} partial</span>
                <span className="text-red-400">✗ {fail} fail</span>
              </div>
            </div>
          </div>

          {/* Article checklist */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Article Checklist</h3>
            <div className="space-y-2">
              {fw.articles.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40">
                  {ARTICLE_ICON[a.status]}
                  <span className="text-xs font-mono text-slate-500 w-20 flex-shrink-0">{a.id}</span>
                  <span className="text-sm text-slate-300 flex-1">{a.name}</span>
                  <span className={`text-xs font-medium capitalize ${
                    a.status === 'pass' ? 'text-emerald-400' : a.status === 'partial' ? 'text-yellow-400' : 'text-red-400'
                  }`}>{a.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {fw.articles.filter(a => a.status !== 'pass').length > 0 && (
            <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20">
              <h3 className="text-sm font-semibold text-brand-400 mb-3">⚡ Recommended Actions</h3>
              <ul className="space-y-1.5">
                {fw.articles.filter(a => a.status !== 'pass').map(a => (
                  <li key={a.id} className="flex items-start gap-2 text-xs text-slate-400">
                    <ChevronRight className="w-3 h-3 text-brand-400 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-300">{a.id}:</strong> {
                        a.status === 'fail'
                          ? `Implement ${a.name.toLowerCase()} controls immediately.`
                          : `Review and strengthen ${a.name.toLowerCase()} coverage.`
                      }
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-800 gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const content = `${fw.shortName} Compliance Report\nScore: ${fw.score}%\nStatus: ${fw.status}\n\nArticles:\n${fw.articles.map(a => `${a.id} - ${a.name}: ${a.status}`).join('\n')}`
                const blob = new Blob([content], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `${fw.id}-report.txt`; a.click()
              }}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <FileDown className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => window.print()}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ComplianceReports() {
  const [selected, setSelected] = useState<Framework | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleGenerate = async (fwId: string) => {
    setGenerating(fwId)
    try {
      await govApi.post('/api/reports/generate', { format: 'pdf', framework: fwId }, { responseType: 'blob' })
    } catch {
      // Governance offline — show preview instead
      const fw = FRAMEWORKS.find(f => f.id === fwId)
      if (fw) setSelected(fw)
    }
    setGenerating(null)
  }

  const overallScore = Math.round(FRAMEWORKS.reduce((a, f) => a + f.score, 0) / FRAMEWORKS.length)

  const TREND_COLORS: Record<string, string> = {
    GDPR: '#22c55e', HIPAA: '#eab308', EU_AI_ACT: '#3b82f6', RBI: '#ef4444',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Compliance Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">GDPR · HIPAA · EU AI Act · RBI — on-demand report generation</p>
        </div>
        <button className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Scores
        </button>
      </div>

      {/* Overall score banner */}
      <div className="card border border-brand-500/20 bg-gradient-to-r from-brand-500/5 to-cyan-500/5">
        <div className="flex items-center gap-6">
          <div className="hidden sm:block">
            <ScoreGauge score={overallScore} color="#6366f1" size={120} />
          </div>
          <div className="flex-1">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Overall Compliance Score</p>
            <p className="text-3xl font-bold text-brand-400 sm:hidden">{overallScore}%</p>
            <p className="text-sm text-slate-400 mt-1">
              Average across {FRAMEWORKS.length} active regulatory frameworks.
              {overallScore >= 80 ? ' Organisation is broadly compliant.' : overallScore >= 60 ? ' Some gaps require attention.' : ' Significant compliance gaps detected.'}
            </p>
            <div className="flex gap-4 mt-3">
              {[
                { label: 'Compliant', count: FRAMEWORKS.filter(f => f.status === 'COMPLIANT').length, cls: 'text-emerald-400' },
                { label: 'Partial', count: FRAMEWORKS.filter(f => f.status === 'PARTIAL').length, cls: 'text-yellow-400' },
                { label: 'Non-Compliant', count: FRAMEWORKS.filter(f => f.status === 'NON_COMPLIANT').length, cls: 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-xl font-bold ${s.cls}`}>{s.count}</p>
                  <p className="text-[10px] text-slate-600">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Framework cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FRAMEWORKS.map(fw => (
          <div key={fw.id} className="card border border-slate-800 hover:border-slate-700 transition-colors">
            {/* Card header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {STATUS_ICON[fw.status]}
                  <h2 className="text-sm font-semibold text-slate-200">{fw.shortName}</h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{fw.name}</p>
              </div>
              <ScoreGauge score={fw.score} color={fw.color} size={80} />
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 mb-3">
              <div
                className="h-1.5 rounded-full transition-all duration-700"
                style={{ width: `${fw.score}%`, background: fw.color }}
              />
            </div>

            {/* Quick article list (collapsed) */}
            <button
              onClick={() => setExpandedId(expandedId === fw.id ? null : fw.id)}
              className="w-full text-left text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1 mb-3 transition-colors"
            >
              <BarChart3 className="w-3 h-3" />
              {fw.articles.length} articles
              <span className="text-emerald-500">, {fw.articles.filter(a => a.status === 'pass').length} passed</span>
              <span className="text-red-500">, {fw.articles.filter(a => a.status === 'fail').length} failed</span>
              <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${expandedId === fw.id ? 'rotate-90' : ''}`} />
            </button>

            {expandedId === fw.id && (
              <div className="space-y-1 mb-3 border-t border-slate-800 pt-3">
                {fw.articles.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    {ARTICLE_ICON[a.status]}
                    <span className="text-slate-500 font-mono w-16 flex-shrink-0">{a.id}</span>
                    <span className="text-slate-400 flex-1 truncate">{a.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 border-t border-slate-800 pt-3">
              <button
                onClick={() => setSelected(fw)}
                className="btn-secondary text-xs py-1.5 flex-1 flex items-center justify-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" /> Preview
              </button>
              <button
                onClick={() => handleGenerate(fw.id)}
                disabled={generating === fw.id}
                className="btn-primary text-xs py-1.5 flex-1 flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {generating === fw.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                {generating === fw.id ? 'Generating…' : 'Download PDF'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Compliance trend chart */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-100 mb-1">Compliance Score Trend — 12 months</h2>
        <p className="text-xs text-slate-500 mb-4">Track progress across all frameworks over time</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={COMPLIANCE_TREND} margin={{ left: -20, right: 10 }}>
            <defs>
              {Object.entries(TREND_COLORS).map(([k, c]) => (
                <linearGradient key={k} id={`cg-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={c} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="month" stroke="#475569" fontSize={10} />
            <YAxis stroke="#475569" fontSize={10} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: 12 }}
              formatter={(v: any, name: string) => [`${v}%`, name.replace('_', ' ')]}
            />
            {Object.entries(TREND_COLORS).map(([k, c]) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                name={k}
                stroke={c}
                fill={`url(#cg-${k})`}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-5 mt-3 justify-center flex-wrap">
          {Object.entries(TREND_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: c }} />
              <span className="text-xs text-slate-500">{k.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Modal */}
      {selected && <ReportPreview fw={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
