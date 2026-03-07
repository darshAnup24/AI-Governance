import { useState } from 'react'
import { Wifi, AlertTriangle, Shield, Eye } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const shadowData = [
    { tool: 'ChatGPT (Personal)', category: 'LLM_CHATBOT', users: 47, events: 312, authorized: false },
    { tool: 'Cursor', category: 'AI_CODING', users: 23, events: 189, authorized: false },
    { tool: 'Claude.ai', category: 'LLM_CHATBOT', users: 15, events: 98, authorized: false },
    { tool: 'Midjourney', category: 'AI_IMAGE', users: 12, events: 67, authorized: false },
    { tool: 'Perplexity', category: 'AI_SEARCH', users: 31, events: 245, authorized: false },
    { tool: 'Copy.ai', category: 'AI_WRITING', users: 8, events: 34, authorized: false },
    { tool: 'GitHub Copilot', category: 'AI_CODING', users: 34, events: 890, authorized: true },
    { tool: 'OpenAI API', category: 'LLM_CHATBOT', users: 12, events: 4521, authorized: true },
]

const byDepartment = [
    { dept: 'Engineering', shadow: 45, authorized: 120 },
    { dept: 'Marketing', shadow: 28, authorized: 15 },
    { dept: 'Sales', shadow: 18, authorized: 8 },
    { dept: 'Legal', shadow: 5, authorized: 3 },
    { dept: 'HR', shadow: 8, authorized: 2 },
    { dept: 'Finance', shadow: 3, authorized: 1 },
]

const categoryColors: Record<string, string> = {
    LLM_CHATBOT: '#ef4444',
    AI_CODING: '#f97316',
    AI_WRITING: '#eab308',
    AI_IMAGE: '#22c55e',
    AI_SEARCH: '#3b82f6',
    AI_AUDIO: '#8b5cf6',
    AI_VIDEO: '#ec4899',
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6']

export default function ShadowAIPage() {
    const [showAuthorized, setShowAuthorized] = useState(false)

    const filteredData = showAuthorized ? shadowData : shadowData.filter(d => !d.authorized)
    const totalShadowUsers = filteredData.filter(d => !d.authorized).reduce((a, b) => a + b.users, 0)
    const totalShadowEvents = filteredData.filter(d => !d.authorized).reduce((a, b) => a + b.events, 0)

    const categoryData = Object.entries(
        filteredData.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + item.events
            return acc
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }))

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Shadow AI</h1>
                    <p className="text-slate-500 mt-1">Unauthorized AI tool usage across your organization</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showAuthorized}
                        onChange={e => setShowAuthorized(e.target.checked)}
                        className="rounded accent-brand-500"
                    />
                    Show authorized tools
                </label>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card-hover border border-red-500/20 bg-red-500/5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-500 uppercase">Shadow AI Users</span>
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                    <span className="text-2xl font-bold text-red-400">{totalShadowUsers}</span>
                </div>
                <div className="card-hover border border-orange-500/20 bg-orange-500/5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-500 uppercase">Shadow Events (30d)</span>
                        <Wifi className="w-4 h-4 text-orange-400" />
                    </div>
                    <span className="text-2xl font-bold text-orange-400">{totalShadowEvents}</span>
                </div>
                <div className="card-hover border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-500 uppercase">Tools Detected</span>
                        <Eye className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-bold text-emerald-400">{filteredData.length}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar Chart: by tool */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">Usage by Tool</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={filteredData.sort((a, b) => b.events - a.events)} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis type="number" stroke="#64748b" fontSize={12} />
                            <YAxis dataKey="tool" type="category" stroke="#64748b" fontSize={11} width={130} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px' }}
                            />
                            <Bar dataKey="events" fill="#6366f1" radius={[0, 4, 4, 0]}>
                                {filteredData.map((entry, i) => (
                                    <Cell key={i} fill={entry.authorized ? '#22c55e' : categoryColors[entry.category] || '#6366f1'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie Chart: by category */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">By Category</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name.replace('_', ' ')} ${(percent * 100).toFixed(0)}%`}>
                                {categoryData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* By Department */}
            <div className="card">
                <h2 className="text-lg font-semibold text-slate-100 mb-4">Shadow AI by Department</h2>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={byDepartment}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="dept" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                        <Bar dataKey="shadow" name="Shadow AI" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="authorized" name="Authorized" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
