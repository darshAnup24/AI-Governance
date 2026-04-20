import { useState } from 'react'
import { Wifi, AlertTriangle, Eye, ShieldOff, CheckCircle2, MapPin, Clock, User } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts'

// ── Mock Data ──────────────────────────────────────────────────────────────────

const SHADOW_TOOLS = [
  { tool: 'ChatGPT (Personal)', category: 'LLM_CHATBOT', users: 47, events: 312, authorized: false, risk: 'HIGH', domain: 'chat.openai.com' },
  { tool: 'Cursor', category: 'AI_CODING', users: 23, events: 189, authorized: false, risk: 'MEDIUM', domain: 'cursor.sh' },
  { tool: 'Claude.ai', category: 'LLM_CHATBOT', users: 15, events: 98, authorized: false, risk: 'HIGH', domain: 'claude.ai' },
  { tool: 'Midjourney', category: 'AI_IMAGE', users: 12, events: 67, authorized: false, risk: 'LOW', domain: 'midjourney.com' },
  { tool: 'Perplexity', category: 'AI_SEARCH', users: 31, events: 245, authorized: false, risk: 'MEDIUM', domain: 'perplexity.ai' },
  { tool: 'Copy.ai', category: 'AI_WRITING', users: 8, events: 34, authorized: false, risk: 'LOW', domain: 'copy.ai' },
  { tool: 'GitHub Copilot', category: 'AI_CODING', users: 34, events: 890, authorized: true, risk: 'MINIMAL', domain: 'github.com' },
  { tool: 'OpenAI API (Corp)', category: 'LLM_CHATBOT', users: 12, events: 4521, authorized: true, risk: 'MINIMAL', domain: 'api.openai.com' },
]

const BY_DEPARTMENT = [
  { dept: 'Engineering', shadow: 45, authorized: 120, score: 82 },
  { dept: 'Marketing', shadow: 28, authorized: 15, score: 65 },
  { dept: 'Sales', shadow: 18, authorized: 8, score: 58 },
  { dept: 'Legal', shadow: 5, authorized: 3, score: 90 },
  { dept: 'HR', shadow: 8, authorized: 2, score: 70 },
  { dept: 'Finance', shadow: 3, authorized: 1, score: 94 },
]

const WEEKLY_TREND = Array.from({ length: 12 }, (_, i) => ({
  week: `W${i + 1}`,
  shadow: 20 + Math.floor(Math.random() * 30),
  authorized: 60 + Math.floor(Math.random() * 40),
}))

// Simulated geo alerts (real coords)
const GEO_ALERTS = [
  { id: 'g1', user: 'charlie@acme.com', tool: 'ChatGPT', location: 'Mumbai, IN', ip: '103.21.xx.xx', time: '2m ago', risk: 'HIGH' },
  { id: 'g2', user: 'diana@acme.com', tool: 'Claude.ai', location: 'Bengaluru, IN', ip: '49.36.xx.xx', time: '15m ago', risk: 'HIGH' },
  { id: 'g3', user: 'fiona@acme.com', tool: 'Perplexity', location: 'Hyderabad, IN', ip: '117.18.xx.xx', time: '1h ago', risk: 'MEDIUM' },
  { id: 'g4', user: 'evan@acme.com', tool: 'Cursor', location: 'Pune, IN', ip: '59.88.xx.xx', time: '2h ago', risk: 'MEDIUM' },
  { id: 'g5', user: 'bob@acme.com', tool: 'Midjourney', location: 'Chennai, IN', ip: '157.47.xx.xx', time: '3h ago', risk: 'LOW' },
]

const CAT_COLORS: Record<string, string> = {
  LLM_CHATBOT: '#ef4444', AI_CODING: '#f97316', AI_WRITING: '#eab308',
  AI_IMAGE: '#22c55e', AI_SEARCH: '#3b82f6', AI_AUDIO: '#8b5cf6',
}
const RISK_COLORS: Record<string, string> = {
  HIGH: 'text-red-400 bg-red-500/10 border-red-500/20',
  MEDIUM: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  LOW: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  MINIMAL: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
}

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6']

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs shadow-xl">
      <p className="text-slate-400 font-medium mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name ?? p.dataKey}: <strong className="text-white">{p.value}</strong></span>
        </div>
      ))}
    </div>
  )
}

// ── Simple SVG World Map Placeholder ─────────────────────────────────────────

function WorldMapViz({ alerts }: { alerts: typeof GEO_ALERTS }) {
  // We render a stylized abstract map using SVG + alert dots
  const dots = [
    { cx: 480, cy: 155, label: 'IN' }, // India
    { cx: 420, cy: 110, label: 'EU' },
    { cx: 200, cy: 120, label: 'US' },
    { cx: 610, cy: 175, label: 'AS' },
  ]
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800">
      <div className="absolute inset-0 overflow-hidden">
        {/* Subtle grid */}
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Alert list overlay */}
      <div className="relative z-10 p-4">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-slate-200">Live Geo-Detections</h3>
          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse ml-1" />
          <span className="text-xs text-slate-500 ml-auto">{alerts.length} alerts in last 24h</span>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {alerts.map(alert => (
            <div key={alert.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors border border-slate-700/30">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 animate-pulse ${
                alert.risk === 'HIGH' ? 'bg-red-400' : alert.risk === 'MEDIUM' ? 'bg-yellow-400' : 'bg-emerald-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <User className="w-3 h-3 text-slate-500" />
                  <span className="text-xs text-slate-300 font-medium">{alert.user}</span>
                  <span className="text-xs text-slate-500">→</span>
                  <span className="text-xs text-red-400 font-semibold">{alert.tool}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <MapPin className="w-3 h-3 text-slate-600" />
                  <span className="text-[10px] text-slate-500">{alert.location}</span>
                  <span className="text-[10px] text-slate-700">·</span>
                  <span className="text-[10px] font-mono text-slate-600">{alert.ip}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${RISK_COLORS[alert.risk]}`}>
                  {alert.risk}
                </span>
                <div className="flex items-center gap-1 mt-1 justify-end">
                  <Clock className="w-3 h-3 text-slate-700" />
                  <span className="text-[10px] text-slate-600">{alert.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* City dots */}
        <div className="flex gap-3 mt-4 flex-wrap">
          <p className="text-[10px] text-slate-600 w-full">Detection locations:</p>
          {['Mumbai', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai'].map(city => (
            <div key={city} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500 opacity-70" />
              <span className="text-[10px] text-slate-500">{city}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ShadowAIPage() {
  const [showAuthorized, setShowAuthorized] = useState(false)
  const [activeTab, setActiveTab] = useState<'tools' | 'geo' | 'trend'>('tools')

  const filtered = showAuthorized ? SHADOW_TOOLS : SHADOW_TOOLS.filter(d => !d.authorized)
  const unauthorized = SHADOW_TOOLS.filter(d => !d.authorized)

  const kpis = [
    { label: 'Shadow Users', value: unauthorized.reduce((a, b) => a + b.users, 0), icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'Shadow Events (30d)', value: unauthorized.reduce((a, b) => a + b.events, 0).toLocaleString(), icon: Wifi, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
    { label: 'Tools Detected', value: unauthorized.length, icon: Eye, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Authorized Tools', value: SHADOW_TOOLS.filter(d => d.authorized).length, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  ]

  const categoryData = Object.entries(
    filtered.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.events
      return acc
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: name.replace('_', ' '), value }))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Shadow AI</h1>
          <p className="text-slate-500 text-sm mt-0.5">Unauthorised AI tool usage detected across your organisation</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
          <div
            onClick={() => setShowAuthorized(!showAuthorized)}
            className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${showAuthorized ? 'bg-brand-500' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${showAuthorized ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          Show authorised tools
        </label>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`card-hover border ${bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <span className={`text-2xl font-bold ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 w-fit">
        {([['tools', 'Tool Inventory'], ['geo', 'Geo Detections'], ['trend', 'Weekly Trend']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Tool Inventory */}
      {activeTab === 'tools' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar chart */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">Events by Tool</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={[...filtered].sort((a, b) => b.events - a.events)} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#475569" fontSize={10} />
                <YAxis dataKey="tool" type="category" stroke="#475569" fontSize={10} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="events" radius={[0, 4, 4, 0]}>
                  {filtered.map((entry, i) => (
                    <Cell key={i} fill={entry.authorized ? '#22c55e' : CAT_COLORS[entry.category] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart + table */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">Events by Category</h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                  {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>

            {/* Tool list */}
            <div className="space-y-1.5 mt-3 max-h-40 overflow-y-auto">
              {filtered.map(t => (
                <div key={t.tool} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    {t.authorized
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      : <ShieldOff className="w-3 h-3 text-red-400 flex-shrink-0" />}
                    <span className="text-slate-300 truncate">{t.tool}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-slate-500">{t.users}u</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border font-medium ${RISK_COLORS[t.risk]}`}>{t.risk}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Geo Detections */}
      {activeTab === 'geo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WorldMapViz alerts={GEO_ALERTS} />

          {/* Department breakdown */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">Shadow AI by Department</h2>
            <div className="space-y-3">
              {BY_DEPARTMENT.map(d => (
                <div key={d.dept}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{d.dept}</span>
                    <span className="text-slate-500">{d.shadow} shadow · {d.authorized} auth</span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div
                      className="bg-red-500 rounded-l-full transition-all duration-500"
                      style={{ width: `${(d.shadow / (d.shadow + d.authorized)) * 100}%` }}
                    />
                    <div
                      className="bg-emerald-500 rounded-r-full transition-all duration-500"
                      style={{ width: `${(d.authorized / (d.shadow + d.authorized)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-xs text-slate-500">Shadow</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-xs text-slate-500">Authorised</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Weekly Trend */}
      {activeTab === 'trend' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Shadow vs Authorised Weekly Usage</h2>
          <p className="text-xs text-slate-500 mb-4">12-week rolling trend — is shadow AI growing or shrinking?</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={WEEKLY_TREND} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="week" stroke="#475569" fontSize={10} />
              <YAxis stroke="#475569" fontSize={10} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="shadow" name="Shadow AI" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="authorized" name="Authorised" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
