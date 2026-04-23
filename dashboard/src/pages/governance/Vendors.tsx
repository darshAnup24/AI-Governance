import { useEffect, useState } from 'react'
import { Plus, Loader2, BarChart3 } from 'lucide-react'
import govApi from '../../lib/govApi'

interface Vendor {
    id: string; name: string; riskLevel: string; services: string[]
    assessmentScore: number | null; lastAssessed: string | null; createdAt: string
}

const riskColors: Record<string, string> = {
    MINIMAL: 'bg-emerald-500', LIMITED: 'bg-yellow-500', HIGH: 'bg-orange-500', UNACCEPTABLE: 'bg-red-500'
}

const fallbackVendors: Vendor[] = [
    { id: '1', name: 'CloudAI Inc.', riskLevel: 'HIGH', services: ['LLM API', 'Fine-tuning'], assessmentScore: 72, lastAssessed: '2024-05-15', createdAt: '2024-01-10' },
    { id: '2', name: 'DataPipeline Co.', riskLevel: 'LIMITED', services: ['Data labeling', 'ETL'], assessmentScore: 45, lastAssessed: '2024-04-20', createdAt: '2024-02-05' },
    { id: '3', name: 'SecureML Ltd.', riskLevel: 'MINIMAL', services: ['Model monitoring'], assessmentScore: 22, lastAssessed: '2024-06-01', createdAt: '2024-03-01' },
]

export default function Vendors() {
    const [vendors, setVendors] = useState<Vendor[]>(fallbackVendors)
    const [assessing, setAssessing] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)
    const [form, setForm] = useState({ name: '', riskLevel: 'LIMITED', services: '' })

    useEffect(() => {
        govApi.get('/api/vendors').then(r => setVendors(r.data)).catch(() => { })
    }, [])

    const handleAssess = async (id: string) => {
        setAssessing(id)
        try {
            await govApi.post(`/api/vendors/${id}/assess`)
            const r = await govApi.get('/api/vendors')
            setVendors(r.data)
        } catch { /* fallback */ }
        setAssessing(null)
    }

    const handleAdd = async () => {
        try {
            await govApi.post('/api/vendors', { ...form, services: form.services.split(',').map(s => s.trim()) })
            const r = await govApi.get('/api/vendors')
            setVendors(r.data)
            setShowAdd(false)
        } catch { /* fallback */ }
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-100">Vendor Management</h1>
                <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Vendor</button>
            </div>

            {showAdd && (
                <div className="card border border-brand-500/20">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input className="input" placeholder="Vendor Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        <select className="input" value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value })}>
                            <option value="MINIMAL">Minimal</option><option value="LIMITED">Limited</option><option value="HIGH">High</option><option value="UNACCEPTABLE">Unacceptable</option>
                        </select>
                        <input className="input" placeholder="Services (comma-separated)" value={form.services} onChange={e => setForm({ ...form, services: e.target.value })} />
                        <button onClick={handleAdd} className="btn-primary">Create</button>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {vendors.map(v => (
                    <div key={v.id} className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <span className="text-sm font-medium text-slate-200">{v.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded ${riskColors[v.riskLevel]} bg-opacity-10 text-opacity-100`}>{v.riskLevel}</span>
                            </div>
                            <div className="flex gap-2 mt-1">
                                {v.services.map((s, i) => <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">{s}</span>)}
                            </div>
                        </div>
                        <div className="w-40">
                            <div className="flex justify-between text-xs mb-1 text-slate-400">
                                <span>Risk Score</span>
                                <span>{v.assessmentScore ?? '—'}</span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full">
                                <div className={`h-2 rounded-full ${riskColors[v.riskLevel]}`} style={{ width: `${v.assessmentScore || 0}%` }} />
                            </div>
                        </div>
                        <button onClick={() => handleAssess(v.id)} disabled={assessing === v.id} className="btn-primary text-xs flex items-center gap-1.5 px-3">
                            {assessing === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
                            {assessing === v.id ? 'Assessing...' : 'Assess'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
