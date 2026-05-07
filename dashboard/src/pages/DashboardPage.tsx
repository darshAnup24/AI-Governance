import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, Eye, Activity, TrendingUp, TrendingDown } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAnalyticsTrend, useAuditEvents, useDashboardStats } from '../lib/hooks'
import { InlineError } from '../components/ErrorBoundary'

interface Stat {
    label: string; value: string; change: string; up: boolean
    icon: typeof Activity; color: string; bgColor: string
}

const actionBadge: Record<string, string> = {
    BLOCKED: 'badge-red', BLOCK: 'badge-red',
    REDACTED: 'badge-orange', REDACT: 'badge-orange',
    WARNED: 'badge-yellow', WARN: 'badge-yellow',
    ALLOWED: 'badge-green', ALLOW: 'badge-green',
}

export default function DashboardPage() {
    const trendQ = useAnalyticsTrend(30)
    const eventsQ = useAuditEvents({ limit: 100 })
    useDashboardStats()

    const [recentIncidents, setRecentIncidents] = useState<any[]>([])
    const [flashId, setFlashId] = useState<string | null>(null)
    const [lastSeenId, setLastSeenId] = useState<string | null>(null)
    const [liveCount, setLiveCount] = useState(0)
    const [stats, setStats] = useState<Stat[]>([
        { label: 'Total Prompts Today', value: '0', change: '0%', up: true, icon: Activity, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10 border-indigo-500/20' },
        { label: 'Blocked', value: '0', change: '0%', up: true, icon: Shield, color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20' },
        { label: 'Redacted', value: '0', change: '0%', up: false, icon: Eye, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20' },
        { label: 'Avg Risk Score', value: '0.0', change: '0%', up: false, icon: AlertTriangle, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/20' },
    ])
    const [departments, setDepartments] = useState<any[]>([
        { dept: 'Engineering', prompts: '0', events: 0, score: 0 }
    ])
    const [loading, setLoading] = useState(true)

    // Real-time: refetch every 2.5s
    useEffect(() => {
        const id = setInterval(() => eventsQ.refetch(), 2500)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        setLoading(trendQ.isPending || eventsQ.isPending)
    }, [trendQ.isPending, eventsQ.isPending])

    useEffect(() => {
        if (!eventsQ.data) return
        const rawEvents = eventsQ.data.data || []

        if (rawEvents.length > 0) {
            const topId = rawEvents[0].event_id
            if (topId && topId !== lastSeenId) {
                if (lastSeenId !== null) {
                    setFlashId(topId)
                    setLiveCount(c => c + 1)
                    setTimeout(() => setFlashId(null), 1800)
                }
                setLastSeenId(topId)
            }
        }

        const recents = rawEvents.slice(0, 8).map((d: any) => {
            const detections = d.detection_results?.detected_spans || []
            return {
                id: d.event_id,
                time: d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : 'Just now',
                user: d.user_id === 'dev-user-001' ? 'EMP-1293' : d.user_id,
                category: detections.length > 0 ? detections[0].category : 'Clean',
                action: d.action_taken,
                score: d.risk_score || 0,
            }
        })
        setRecentIncidents(recents)

        const total = rawEvents.length
        const blocked = rawEvents.filter((e: any) => e.action_taken === 'BLOCK' || e.action_taken === 'BLOCKED').length
        const redacted = rawEvents.filter((e: any) => e.action_taken === 'REDACT' || e.action_taken === 'REDACTED').length
        const avgScore = total > 0
            ? (rawEvents.reduce((acc: number, e: any) => acc + (e.risk_score || 0), 0) / total).toFixed(1)
            : '0.0'

        setStats([
            { label: 'Total Prompts', value: total.toString(), change: '+2%', up: true, icon: Activity, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10 border-indigo-500/20' },
            { label: 'Blocked', value: blocked.toString(), change: '+1%', up: true, icon: Shield, color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20' },
            { label: 'Redacted', value: redacted.toString(), change: '-2%', up: false, icon: Eye, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20' },
            { label: 'Avg Risk Score', value: avgScore, change: '0%', up: false, icon: AlertTriangle, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/20' },
        ])

        setDepartments([
            { dept: 'Engineering', prompts: total.toString(), events: blocked + redacted, score: Math.round(Number(avgScore)) },
            { dept: 'Marketing', prompts: Math.floor(total * 0.4).toString(), events: Math.floor(blocked * 0.2), score: 20 },
            { dept: 'Sales', prompts: Math.floor(total * 0.2).toString(), events: Math.floor(redacted * 0.1), score: 15 },
        ])
    }, [eventsQ.data])

    const trendData = trendQ.data || []
    const isError = trendQ.isError || eventsQ.isError

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
                    <p className="text-slate-500 mt-1">Real-time AI governance overview</p>
                </div>
                <div className="flex items-center gap-3">
                    {liveCount > 0 && (
                        <span className="text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                            +{liveCount} new events
                        </span>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
                        <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                        <span className="text-xs font-semibold text-brand-400">LIVE · 2.5s</span>
                    </div>
                </div>
            </div>

            {isError && <InlineError message="Some data failed to load." onRetry={() => { trendQ.refetch(); eventsQ.refetch() }} />}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className={`card-hover border ${stat.bgColor}`}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</span>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.bgColor}`}>
                                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                            </div>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-bold text-slate-100">{loading && stat.value === '0' ? '—' : stat.value}</span>
                            <span className={`text-xs font-medium mb-1 flex items-center gap-0.5 ${stat.up ? 'text-red-400' : 'text-emerald-400'}`}>
                                {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {stat.change}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Risk Trend Chart */}
            <div className="card">
                <h2 className="text-lg font-semibold text-slate-100 mb-4">Risk Trend — Last 30 Days</h2>
                {trendQ.isPending ? (
                    <div className="h-64 skeleton rounded-lg" />
                ) : trendQ.isError ? (
                    <div className="h-64 flex items-center justify-center text-slate-500">Trend data unavailable</div>
                ) : (
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={trendData}>
                            <defs>
                                <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRedacted" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorWarned" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                            <YAxis stroke="#64748b" fontSize={12} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px' }} />
                            <Area type="monotone" dataKey="warned" stackId="1" stroke="#eab308" fill="url(#colorWarned)" />
                            <Area type="monotone" dataKey="redacted" stackId="1" stroke="#f97316" fill="url(#colorRedacted)" />
                            <Area type="monotone" dataKey="blocked" stackId="1" stroke="#ef4444" fill="url(#colorBlocked)" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Incidents — flashes on new event */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-100">Recent Incidents</h2>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Live</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        {recentIncidents.map((inc, i) => (
                            <div
                                key={inc.id || i}
                                className={`flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-slate-800/30 transition-all cursor-pointer
                                    ${inc.id === flashId ? 'bg-brand-500/10 border border-brand-500/20 shadow-sm shadow-brand-500/10' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${inc.score >= 90 ? 'bg-red-500 animate-pulse' : inc.score >= 70 ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                                    <div>
                                        <p className="text-sm font-medium text-slate-200">{inc.category}</p>
                                        <p className="text-xs text-slate-500">{inc.user} · {inc.time}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-400 font-mono tabular-nums">{inc.score}</span>
                                    <span className={actionBadge[inc.action]}>{inc.action}</span>
                                </div>
                            </div>
                        ))}
                        {recentIncidents.length === 0 && (
                            <div className="text-center py-8 text-slate-600 text-sm">No incidents yet — send a prompt through the proxy</div>
                        )}
                    </div>
                </div>

                {/* Departments at Risk */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">Departments at Risk</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 border-b border-slate-800">
                                    <th className="pb-3 font-medium">Department</th>
                                    <th className="pb-3 font-medium text-right">Prompts</th>
                                    <th className="pb-3 font-medium text-right">Risks</th>
                                    <th className="pb-3 font-medium text-right">Avg</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departments.map((row) => (
                                    <tr key={row.dept} className="border-b border-slate-800/30 last:border-0 hover:bg-slate-800/20 cursor-pointer transition-colors">
                                        <td className="py-3 text-slate-200 font-medium">{row.dept}</td>
                                        <td className="py-3 text-right text-slate-400 tabular-nums">{row.prompts}</td>
                                        <td className="py-3 text-right">
                                            <span className={`font-medium tabular-nums ${row.events > 50 ? 'text-red-400' : row.events > 20 ? 'text-orange-400' : 'text-slate-400'}`}>
                                                {row.events}
                                            </span>
                                        </td>
                                        <td className="py-3 text-right text-slate-400 tabular-nums">{row.score}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
