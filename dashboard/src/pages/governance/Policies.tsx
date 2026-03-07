import { useEffect, useState } from 'react'
import { Plus, FileText, Pencil, Trash2 } from 'lucide-react'
import govApi from '../../lib/govApi'

interface Policy {
    id: string; title: string; content: string; category: string; status: string; createdAt: string
}

const statusColors: Record<string, string> = {
    DRAFT: 'bg-slate-500/10 text-slate-400', ACTIVE: 'bg-emerald-500/10 text-emerald-400', ARCHIVED: 'bg-orange-500/10 text-orange-400'
}

const templates = [
    { title: 'AI Usage Policy', category: 'governance', summary: 'Organization-wide acceptable use policy for AI tools' },
    { title: 'Data Governance Policy', category: 'data', summary: 'Data handling, classification, and retention rules' },
    { title: 'Model Risk Policy', category: 'risk', summary: 'Risk assessment and management requirements for AI models' },
]

const fallbackPolicies: Policy[] = [
    { id: '1', title: 'AI Usage Policy', content: 'This policy governs the acceptable use of AI systems within the organization.', category: 'governance', status: 'ACTIVE', createdAt: '2024-01-15' },
    { id: '2', title: 'Data Governance Policy', content: 'All data used in AI systems must be classified and handled appropriately.', category: 'data', status: 'ACTIVE', createdAt: '2024-02-01' },
    { id: '3', title: 'Incident Response Plan', content: 'Procedures for handling AI-related security incidents.', category: 'security', status: 'ACTIVE', createdAt: '2024-02-15' },
    { id: '4', title: 'Model Deployment Policy', content: 'Requirements for deploying AI models to production.', category: 'engineering', status: 'DRAFT', createdAt: '2024-03-01' },
]

export default function Policies() {
    const [policies, setPolicies] = useState<Policy[]>(fallbackPolicies)
    const [editing, setEditing] = useState<Policy | null>(null)
    const [showAdd, setShowAdd] = useState(false)
    const [form, setForm] = useState({ title: '', content: '', category: 'general', status: 'DRAFT' })

    useEffect(() => {
        govApi.get('/api/policies').then(r => setPolicies(r.data)).catch(() => { })
    }, [])

    const save = async () => {
        try {
            if (editing) {
                await govApi.put(`/api/policies/${editing.id}`, form)
            } else {
                await govApi.post('/api/policies', form)
            }
            const r = await govApi.get('/api/policies')
            setPolicies(r.data)
            setForm({ title: '', content: '', category: 'general', status: 'DRAFT' })
            setEditing(null)
            setShowAdd(false)
        } catch { /* fallback */ }
    }

    const startEdit = (p: Policy) => {
        setEditing(p)
        setForm({ title: p.title, content: p.content, category: p.category, status: p.status })
        setShowAdd(true)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-100">Policies</h1>
                <button onClick={() => { setShowAdd(!showAdd); setEditing(null); setForm({ title: '', content: '', category: 'general', status: 'DRAFT' }) }} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Policy
                </button>
            </div>

            {/* Templates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map(t => (
                    <button key={t.title} onClick={() => { setForm({ title: t.title, content: '', category: t.category, status: 'DRAFT' }); setShowAdd(true) }}
                        className="card text-left hover:border-brand-500/30 transition-colors border border-transparent">
                        <FileText className="w-5 h-5 text-brand-400 mb-2" />
                        <h3 className="text-sm font-medium text-slate-200">{t.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">{t.summary}</p>
                    </button>
                ))}
            </div>

            {/* Editor */}
            {showAdd && (
                <div className="card border border-brand-500/20">
                    <h3 className="text-sm font-semibold text-brand-400 mb-3">{editing ? 'Edit Policy' : 'New Policy'}</h3>
                    <div className="space-y-3">
                        <input className="input w-full" placeholder="Policy Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                        <textarea className="input w-full h-40 font-mono text-sm" placeholder="Policy content..." value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
                        <div className="flex gap-3">
                            <input className="input flex-1" placeholder="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                            <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                <option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option>
                            </select>
                            <button onClick={save} className="btn-primary">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Policy List */}
            <div className="space-y-2">
                {policies.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-200">{p.title}</span>
                                <span className={`text-xs px-2 py-0.5 rounded ${statusColors[p.status]}`}>{p.status}</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">{p.category}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 max-w-xl truncate">{p.content}</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => startEdit(p)} className="text-slate-500 hover:text-brand-400"><Pencil className="w-4 h-4" /></button>
                            <button className="text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
