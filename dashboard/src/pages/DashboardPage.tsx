import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, Eye, Activity, TrendingUp, TrendingDown } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../lib/api'

interface TrendData {
    date: string
    blocked: number
    redacted: number
    warned: number
}

interface Stat {
    label: string
    value: string
    change: string
    up: boolean
    icon: typeof Activity
    color: string
    bgColor: string
}

const stats: Stat[] = [
    { label: 'Total Prompts Today', value: '12,847', change: '+12%', up: true, icon: Activity, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10 border-indigo-500/20' },
    { label: 'Blocked', value: '23', change: '+5%', up: true, icon: Shield, color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20' },
    { label: 'Redacted', value: '156', change: '-8%', up: false, icon: Eye, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20' },
    { label: 'Avg Risk Score', value: '34.2', change: '-3%', up: false, icon: AlertTriangle, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/20' },
]

const recentIncidents = [
    { time: '2 min ago', user: 'EMP-4821', category: 'API Key', action: 'BLOCKED', score: 95 },
    { time: '8 min ago', user: 'EMP-1293', category: 'PII (SSN)', action: 'REDACTED', score: 82 },
    { time: '15 min ago', user: 'EMP-7744', category: 'Source Code', action: 'WARNED', score: 65 },
    { time: '22 min ago', user: 'EMP-3019', category: 'PII (Email)', action: 'REDACTED', score: 78 },
    { time: '31 min ago', user: 'EMP-5562', category: 'Credentials', action: 'BLOCKED', score: 92 },
    { time: '43 min ago', user: 'EMP-8901', category: 'Confidential', action: 'WARNED', score: 61 },
    { time: '1 hr ago', user: 'EMP-2345', category: 'PII (Phone)', action: 'REDACTED', score: 73 },
    { time: '1.5 hr ago', user: 'EMP-6677', category: 'API Key', action: 'BLOCKED', score: 98 },
]

const actionBadge: Record<string, string> = {
    BLOCKED: 'badge-red',
    REDACTED: 'badge-orange',
    WARNED: 'badge-yellow',
    ALLOWED: 'badge-green',
}

const departments = [
    { dept: 'Engineering', prompts: '4,231', events: 89, score: 42, trend: 'up' },
    { dept: 'Marketing', prompts: '2,847', events: 45, score: 38, trend: 'down' },
    { dept: 'Sales', prompts: '1,923', events: 23, score: 31, trend: 'up' },
    { dept: 'Legal', prompts: '892', events: 12, score: 28, trend: 'down' },
    { dept: 'HR', prompts: '654', events: 8, score: 22, trend: 'stable' },
    { dept: 'Finance', prompts: '432', events: 6, score: 19, trend: 'down' },
]

export default function DashboardPage() {
    const [trendData, setTrendData] = useState<TrendData[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchTrend = async () => {
            try {
                const resp = await api.get('/api/v1/analytics/trend?days=30')
                setTrendData(resp.data.data)
            } catch {
                // Fallback: generate sample data
                const data: TrendData[] = []
                for (let i = 0; i < 30; i++) {
                    const date = new Date()
                    date.setDate(date.getDate() - (29 - i))
                    data.push({
                        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        blocked: Math.floor(10 + Math.random() * 20),
                        redacted: Math.floor(30 + Math.random() * 40),
                        warned: Math.floor(60 + Math.random() * 50),
                    })
                }
                setTrendData(data)
            } finally {
                setLoading(false)
            }
        }
        fetchTrend()
        const interval = setInterval(fetchTrend, 30000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
                <p className="text-slate-500 mt-1">Real-time AI governance overview</p>
            </div>

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
                            <span className="text-2xl font-bold text-slate-100">{stat.value}</span>
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
                {loading ? (
                    <div className="h-64 skeleton rounded-lg" />
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
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: '8px',
                                    color: '#e2e8f0',
                                    fontSize: '12px',
                                }}
                            />
                            <Area type="monotone" dataKey="warned" stackId="1" stroke="#eab308" fill="url(#colorWarned)" />
                            <Area type="monotone" dataKey="redacted" stackId="1" stroke="#f97316" fill="url(#colorRedacted)" />
                            <Area type="monotone" dataKey="blocked" stackId="1" stroke="#ef4444" fill="url(#colorBlocked)" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Incidents */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">Recent Incidents</h2>
                    <div className="space-y-1">
                        {recentIncidents.map((inc, i) => (
                            <div key={i} className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-slate-800/30 transition-colors cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${inc.score >= 90 ? 'bg-red-500 animate-pulse-slow' : inc.score >= 70 ? 'bg-orange-500' : 'bg-yellow-500'}`} />
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
