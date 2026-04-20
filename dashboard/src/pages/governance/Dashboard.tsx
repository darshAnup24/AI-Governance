import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts'
import {
  Shield, AlertTriangle, Activity, FileCheck, Zap, BookOpen, Eye, TrendingUp,
} from 'lucide-react'
import { useAnalyticsTrend, useDetectionBreakdown, useDashboardStats } from '../../lib/hooks'
import { SkeletonKPIGrid, SkeletonChart } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'

const ACTION_COLORS = {
  ALLOW: '#22c55e',
  LOG: '#3b82f6',
  WARN: '#eab308',
  REDACT: '#f97316',
  BLOCK: '#ef4444',
}

const KPI_CONFIG = [
  { key: 'totalRequests', label: 'Total Requests', icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10', suffix: '' },
  { key: 'blockedToday', label: 'Blocked Today', icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10', suffix: '' },
  { key: 'redactedToday', label: 'Redacted', icon: Eye, color: 'text-orange-400', bg: 'bg-orange-500/10', suffix: '' },
  { key: 'avgRiskScore', label: 'Avg Risk Score', icon: TrendingUp, color: 'text-yellow-400', bg: 'bg-yellow-500/10', suffix: '' },
  { key: 'complianceScore', label: 'Compliance', icon: FileCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', suffix: '%' },
  { key: 'policiesActive', label: 'Active Policies', icon: BookOpen, color: 'text-indigo-400', bg: 'bg-indigo-500/10', suffix: '' },
  { key: 'shadowAIAlerts', label: 'Shadow AI', icon: AlertTriangle, color: 'text-purple-400', bg: 'bg-purple-500/10', suffix: '' },
  { key: 'activeIncidents', label: 'Incidents', icon: Zap, color: 'text-pink-400', bg: 'bg-pink-500/10', suffix: '' },
] as const

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl shadow-black/40 text-xs">
      <p className="text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.dataKey}: <strong className="text-white">{p.value}</strong></span>
        </div>
      ))}
    </div>
  )
}

export default function GovDashboard() {
  const statsQ = useDashboardStats()
  const trendQ = useAnalyticsTrend(30)
  const breakdownQ = useDetectionBreakdown()

  const stats = statsQ.data
  const trendData = trendQ.data ?? []
  const breakdown = breakdownQ.data ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Governance Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Real-time prompt monitoring &amp; risk analytics</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">Live</span>
        </div>
      </div>

      {/* KPI Grid */}
      {statsQ.isPending ? (
        <SkeletonKPIGrid count={8} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {KPI_CONFIG.map(({ key, label, icon: Icon, color, bg, suffix }) => (
            <div key={key} className={`card-hover ${bg} border border-slate-700/50 group`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight">{label}</span>
                <Icon className={`w-3.5 h-3.5 ${color} group-hover:scale-110 transition-transform`} />
              </div>
              <span className={`text-xl font-bold ${color}`}>
                {(stats as any)?.[key] ?? '—'}{suffix}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Action Trend */}
        {trendQ.isPending ? (
          <div className="lg:col-span-2"><SkeletonChart height={260} /></div>
        ) : (
          <div className="card lg:col-span-2">
            <h2 className="text-base font-semibold text-slate-100 mb-1">Action Trend — 30 days</h2>
            <p className="text-xs text-slate-500 mb-4">Daily breakdown of ALLOW / LOG / WARN / REDACT / BLOCK decisions</p>
            {trendQ.isError && <InlineError message="Using demo data" />}
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  {Object.entries(ACTION_COLORS).map(([k, c]) => (
                    <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={c} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#475569" fontSize={10} tickFormatter={v => v.slice(5)} />
                <YAxis stroke="#475569" fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                {Object.entries(ACTION_COLORS).map(([k, c]) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={c}
                    fill={`url(#grad-${k})`}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Detection Category Breakdown */}
        {breakdownQ.isPending ? (
          <SkeletonChart height={260} />
        ) : (
          <div className="card">
            <h2 className="text-base font-semibold text-slate-100 mb-1">Detection Categories</h2>
            <p className="text-xs text-slate-500 mb-4">Threats by category (all time)</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={breakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {breakdown.map((d: any, i: number) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {breakdown.map((d: any) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-400">{d.name}</span>
                  </div>
                  <span className="text-slate-300 font-medium">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action bar chart */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-100 mb-1">Weekly Action Volume</h2>
        <p className="text-xs text-slate-500 mb-4">Requests handled per day this week</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={trendData.slice(-7)} margin={{ left: -20, right: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" stroke="#475569" fontSize={10} tickFormatter={v => v.slice(5)} />
            <YAxis stroke="#475569" fontSize={10} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {Object.entries(ACTION_COLORS).map(([k, c]) => (
              <Bar key={k} dataKey={k} stackId="a" fill={c} radius={k === 'ALLOW' ? [4, 4, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
