import { useEffect, useState } from 'react'
import { Plus, Scan, Trash2 } from 'lucide-react'
import govApi from '../../lib/govApi'

interface AIModel {
    id: string; name: string; provider: string; version: string; purpose: string
    riskLevel: string; status: string; createdAt: string
    riskAssessments?: { overallScore: number }[]
}

const riskColors: Record<string, string> = {
    MINIMAL: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    LIMITED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    UNACCEPTABLE: 'bg-red-500/10 text-red-400 border-red-500/30',
}

const fallbackModels: AIModel[] = [
    { id: '1', name: 'GPT Wrapper Service', provider: 'Internal', version: '2.1', purpose: 'Customer support chatbot', riskLevel: 'HIGH', status: 'ACTIVE', createdAt: '2024-01-15', riskAssessments: [{ overallScore: 72 }] },
    { id: '2', name: 'HR Screening Tool', provider: 'Internal', version: '1.0', purpose: 'Resume screening and ranking', riskLevel: 'UNACCEPTABLE', status: 'UNDER_REVIEW', createdAt: '2024-02-01', riskAssessments: [{ overallScore: 91 }] },
    { id: '3', name: 'Customer Chatbot', provider: 'Internal', version: '3.2', purpose: 'FAQ and support', riskLevel: 'LIMITED', status: 'ACTIVE', createdAt: '2024-03-10', riskAssessments: [{ overallScore: 35 }] },
    { id: '4', name: 'Fraud Detector', provider: 'Internal', version: '1.5', purpose: 'Transaction fraud detection', riskLevel: 'HIGH', status: 'ACTIVE', createdAt: '2024-04-20', riskAssessments: [{ overallScore: 78 }] },
    { id: '5', name: 'Internal Search', provider: 'Internal', version: '1.0', purpose: 'Document search and retrieval', riskLevel: 'MINIMAL', status: 'ACTIVE', createdAt: '2024-05-15', riskAssessments: [{ overallScore: 12 }] },
]

export default function Models() {
    const [models, setModels] = useState<AIModel[]>(fallbackModels)
    const [showAdd, setShowAdd] = useState(false)
    const [scanning, setScanning] = useState<string | null>(null)
    const [form, setForm] = useState({ name: '', provider: '', version: '1.0', purpose: '', riskLevel: 'LIMITED' })

    useEffect(() => {
        govApi.get('/api/models').then(r => setModels(r.data)).catch(() => { })
    }, [])

    const handleScan = async (id: string) => {
        setScanning(id)
        try {
            await govApi.post(`/api/models/${id}/scan`)
            const r = await govApi.get('/api/models')
            setModels(r.data)
        } catch { /* fallback */ }
        setScanning(null)
    }

    const handleAdd = async () => {
        try {
            await govApi.post('/api/models', form)
            const r = await govApi.get('/api/models')
            setModels(r.data)
            setShowAdd(false)
            setForm({ name: '', provider: '', version: '1.0', purpose: '', riskLevel: 'LIMITED' })
        } catch { /* fallback */ }
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">AI Model Registry</h1>
                    <p className="text-slate-500 mt-1">Manage and assess your AI model inventory</p>
                </div>
                <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add Model
                </button>
            </div>

            {showAdd && (
                <div className="card border border-brand-500/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <input className="input" placeholder="Model Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        <input className="input" placeholder="Provider" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} />
                        <input className="input" placeholder="Version" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} />
                        <input className="input" placeholder="Purpose" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
                        <select className="input" value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value })}>
                            <option value="MINIMAL">Minimal</option>
                            <option value="LIMITED">Limited</option>
                            <option value="HIGH">High</option>
                            <option value="UNACCEPTABLE">Unacceptable</option>
                        </select>
                        <button onClick={handleAdd} className="btn-primary">Create</button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-800">
                            <th className="text-left py-3 text-slate-500 font-medium">Model</th>
                            <th className="text-left py-3 text-slate-500 font-medium">Provider</th>
                            <th className="text-left py-3 text-slate-500 font-medium">Purpose</th>
                            <th className="text-left py-3 text-slate-500 font-medium">Risk Level</th>
                            <th className="text-left py-3 text-slate-500 font-medium">Score</th>
                            <th className="text-left py-3 text-slate-500 font-medium">Status</th>
                            <th className="text-right py-3 text-slate-500 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {models.map(m => (
                            <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <td className="py-3">
                                    <span className="text-slate-200 font-medium">{m.name}</span>
                                    <span className="text-xs text-slate-600 ml-2">v{m.version}</span>
                                </td>
                                <td className="py-3 text-slate-400">{m.provider}</td>
                                <td className="py-3 text-slate-400 max-w-[200px] truncate">{m.purpose}</td>
                                <td className="py-3">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${riskColors[m.riskLevel] || ''}`}>{m.riskLevel}</span>
                                </td>
                                <td className="py-3">
                                    <span className={`font-mono font-bold ${(m.riskAssessments?.[0]?.overallScore || 0) >= 70 ? 'text-red-400' : (m.riskAssessments?.[0]?.overallScore || 0) >= 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                        {m.riskAssessments?.[0]?.overallScore ?? '—'}
                                    </span>
                                </td>
                                <td className="py-3 text-slate-400">{m.status}</td>
                                <td className="py-3 text-right">
                                    <button onClick={() => handleScan(m.id)} disabled={scanning === m.id} className="text-brand-400 hover:text-brand-300 mr-3">
                                        {scanning === m.id ? <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" /> : <Scan className="w-4 h-4" />}
                                    </button>
                                    <button className="text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
