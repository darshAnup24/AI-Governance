import { useEffect, useState } from 'react'
import { Plus, GripVertical } from 'lucide-react'
import govApi from '../../lib/govApi'

interface Incident {
    id: string; title: string; description: string; severity: string; status: string
    createdAt: string; model?: { name: string }
}

const sevColors: Record<string, string> = {
    CRITICAL: 'border-l-red-500 bg-red-500/5', HIGH: 'border-l-orange-500 bg-orange-500/5',
    MEDIUM: 'border-l-yellow-500 bg-yellow-500/5', LOW: 'border-l-emerald-500 bg-emerald-500/5'
}
const sevBadge: Record<string, string> = {
    CRITICAL: 'bg-red-500/10 text-red-400', HIGH: 'bg-orange-500/10 text-orange-400',
    MEDIUM: 'bg-yellow-500/10 text-yellow-400', LOW: 'bg-emerald-500/10 text-emerald-400'
}

const columns = ['OPEN', 'INVESTIGATING', 'RESOLVED'] as const

const fallbackIncidents: Incident[] = [
    { id: '1', title: 'HR Model discriminates by age', description: 'Bias detected in resume screening model', severity: 'CRITICAL', status: 'OPEN', createdAt: '2024-06-01T10:00:00Z', model: { name: 'HR Screening Tool' } },
    { id: '2', title: 'Data leak via prompt injection', description: 'System prompt override detected', severity: 'HIGH', status: 'INVESTIGATING', createdAt: '2024-05-28T14:30:00Z', model: { name: 'Customer Chatbot' } },
    { id: '3', title: 'GDPR violation in logging', description: 'PII found in audit logs', severity: 'HIGH', status: 'OPEN', createdAt: '2024-05-25T09:15:00Z' },
    { id: '4', title: 'Model hallucinating citations', description: 'Fabricated references in research output', severity: 'MEDIUM', status: 'INVESTIGATING', createdAt: '2024-05-20T11:00:00Z', model: { name: 'GPT Wrapper Service' } },
    { id: '5', title: 'SQL injection in generated code', description: 'Code generation produced vulnerable SQL', severity: 'MEDIUM', status: 'RESOLVED', createdAt: '2024-05-15T16:45:00Z' },
]

export default function Incidents() {
    const [incidents, setIncidents] = useState<Incident[]>(fallbackIncidents)
    const [showAdd, setShowAdd] = useState(false)
    const [form, setForm] = useState({ title: '', description: '', severity: 'MEDIUM' })

    useEffect(() => {
        govApi.get('/api/incidents').then(r => setIncidents(r.data)).catch(() => { })
    }, [])

    const handleAdd = async () => {
        try {
            await govApi.post('/api/incidents', form)
            const r = await govApi.get('/api/incidents')
            setIncidents(r.data)
            setShowAdd(false)
            setForm({ title: '', description: '', severity: 'MEDIUM' })
        } catch { /* fallback */ }
    }

    const moveIncident = async (id: string, newStatus: string) => {
        try {
            await govApi.patch(`/api/incidents/${id}/status`, { status: newStatus })
            setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))
        } catch { /* fallback */ }
    }

    const daysAgo = (d: string) => {
        const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
        return days === 0 ? 'Today' : `${days}d ago`
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-100">Incidents</h1>
                <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Report Incident
                </button>
            </div>

            {showAdd && (
                <div className="card border border-brand-500/20">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input className="input" placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                        <input className="input" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                        <div className="flex gap-2">
                            <select className="input flex-1" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                                <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                            </select>
                            <button onClick={handleAdd} className="btn-primary">Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kanban */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {columns.map(col => (
                    <div key={col} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{col.replace('_', ' ')}</h2>
                            <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
                                {incidents.filter(i => i.status === col).length}
                            </span>
                        </div>
                        <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-slate-900/50 border border-slate-800/50">
                            {incidents.filter(i => i.status === col).map(inc => (
                                <div key={inc.id} className={`p-3 rounded-lg border-l-3 ${sevColors[inc.severity]} border border-slate-800/50 cursor-move hover:border-slate-700 transition-colors`}>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-slate-200">{inc.title}</p>
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{inc.description}</p>
                                        </div>
                                        <GripVertical className="w-3.5 h-3.5 text-slate-700 shrink-0 mt-0.5" />
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${sevBadge[inc.severity]}`}>{inc.severity}</span>
                                            {inc.model && <span className="text-xs text-slate-600">{inc.model.name}</span>}
                                        </div>
                                        <span className="text-xs text-slate-600">{daysAgo(inc.createdAt)}</span>
                                    </div>
                                    {col !== 'RESOLVED' && (
                                        <div className="flex gap-1 mt-2">
                                            {col === 'OPEN' && <button onClick={() => moveIncident(inc.id, 'INVESTIGATING')} className="text-xs text-blue-400 hover:text-blue-300">→ Investigate</button>}
                                            {col === 'INVESTIGATING' && <button onClick={() => moveIncident(inc.id, 'RESOLVED')} className="text-xs text-emerald-400 hover:text-emerald-300">→ Resolve</button>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
