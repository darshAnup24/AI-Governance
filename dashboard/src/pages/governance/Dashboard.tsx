import { useEffect, useState } from 'react'
import { Shield, AlertTriangle, Activity, FileCheck, Zap, BookOpen } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import govApi from '../../lib/govApi'

interface Stats {
    totalModels: number
    activeIncidents: number
    avgRiskScore: number
    complianceScore: number
    threatsTodayCount: number
    policiesActive: number
    riskTrend: { date: string; score: number }[]
    frameworkScores: Record<string, number>
}

const fallbackStats: Stats = {
    totalModels: 5, activeIncidents: 3, avgRiskScore: 62, complianceScore: 74,
    threatsTodayCount: 12, policiesActive: 8,
    riskTrend: Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
        score: 40 + Math.floor(Math.random() * 40)
    })),
    frameworkScores: { EU_AI_ACT: 72, ISO_42001: 68, NIST_AI_RMF: 81, ISO_27001: 75 }
}

const kpiConfig = [
    { key: 'totalModels', label: 'AI Models', icon: Shield, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { key: 'activeIncidents', label: 'Active Incidents', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { key: 'avgRiskScore', label: 'Avg Risk Score', icon: Activity, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { key: 'complianceScore', label: 'Compliance', icon: FileCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', suffix: '%' },
    { key: 'threatsTodayCount', label: 'Threats Today', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { key: 'policiesActive', label: 'Active Policies', icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-500/10' },
] as const

const frameworkLabels: Record<string, string> = {
    EU_AI_ACT: 'EU AI Act', ISO_42001: 'ISO 42001', NIST_AI_RMF: 'NIST AI RMF', ISO_27001: 'ISO 27001'
}

export default function GovDashboard() {
    const [stats, setStats] = useState<Stats>(fallbackStats)

    useEffect(() => {
        govApi.get('/api/dashboard/stats').then(r => setStats(r.data)).catch(() => { })
    }, [])

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-100">AI Governance Dashboard</h1>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {kpiConfig.map(({ key, label, icon: Icon, color, bg, suffix }) => (
                    <div key={key} className={`card-hover ${bg} border border-slate-700/50`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <span className={`text-2xl font-bold ${color}`}>
                            {(stats as any)[key]}{suffix || ''}
                        </span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Risk Trend */}
                <div className="card lg:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">Risk Trend (30 days)</h2>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={stats.riskTrend}>
                            <defs>
                                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={v => v.slice(5)} />
                            <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                            <Area type="monotone" dataKey="score" stroke="#f97316" fill="url(#riskGrad)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Compliance Frameworks */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">Compliance</h2>
                    <div className="space-y-4">
                        {Object.entries(stats.frameworkScores).map(([fw, score]) => (
                            <div key={fw}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-slate-300">{frameworkLabels[fw] || fw}</span>
                                    <span className={score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}>{score}%</span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full transition-all duration-500 ${score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                        style={{ width: `${score}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
