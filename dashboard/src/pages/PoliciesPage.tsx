import { useState } from 'react'
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight, Play, Loader2 } from 'lucide-react'
import { usePolicies, useCreatePolicy, useUpdatePolicy, useDeletePolicy, useTogglePolicy } from '../lib/hooks'
import { SkeletonTable } from '../components/Skeletons'
import { InlineError } from '../components/ErrorBoundary'

interface PolicyRule {
    id: string
    name: string
    description: string
    action: string
    priority: number
    enabled: boolean
    conditions: any[]
    logic?: string
}

const actionColors: Record<string, string> = {
    BLOCK: 'badge-red',
    REDACT: 'badge-orange',
    WARN: 'badge-yellow',
    ALLOW: 'badge-green',
    LOG: 'badge-blue',
}

export default function PoliciesPage() {
    const { data: policies, isPending, isError, refetch } = usePolicies()
    const createMutation = useCreatePolicy()
    const updateMutation = useUpdatePolicy()
    const deleteMutation = useDeletePolicy()
    const toggleMutation = useTogglePolicy()

    const [showCreate, setShowCreate] = useState(false)
    const [testResult, setTestResult] = useState<string | null>(null)
    const [testScore, setTestScore] = useState(75)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState({
        name: '',
        description: '',
        action: 'WARN',
        priority: 100,
        conditions: [{ field: 'riskScore', op: 'gte', value: '60' }],
        enabled: true,
    })

    const handleToggle = (id: string, enabled: boolean) => {
        toggleMutation.mutate({ id, enabled: !enabled })
    }

    const handleDelete = (id: string, name: string) => {
        if (confirm(`Delete policy "${name}"?`)) {
            deleteMutation.mutate(id)
        }
    }

    const handleEdit = (policy: PolicyRule) => {
        setEditingId(policy.id)
        setForm({
            name: policy.name,
            description: policy.description || '',
            action: policy.action,
            priority: policy.priority,
            conditions: policy.conditions || [],
            enabled: policy.enabled,
        })
        setShowCreate(true)
    }

    const handleSave = async () => {
        if (!form.name.trim()) return
        const payload = {
            ...form,
            conditions: form.conditions,
        }
        if (editingId) {
            await updateMutation.mutateAsync({ id: editingId, ...payload })
        } else {
            await createMutation.mutateAsync(payload)
        }
        setShowCreate(false)
        setEditingId(null)
        setForm({ name: '', description: '', action: 'WARN', priority: 100, conditions: [{ field: 'riskScore', op: 'gte', value: '60' }], enabled: true })
    }

    const runTest = () => {
        let result = 'ALLOW'
        const activePolicies = (policies || [])
            .filter((p: PolicyRule) => p.enabled)
            .sort((a: PolicyRule, b: PolicyRule) => a.priority - b.priority)
        for (const policy of activePolicies) {
            const scoreCondition = policy.conditions?.find((c: any) => c.field === 'riskScore' || c.field === 'risk_score')
            if (scoreCondition && testScore >= Number(scoreCondition.value)) {
                result = policy.action
                break
            }
        }
        setTestResult(result)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Policies</h1>
                    <p className="text-slate-500 mt-1">Manage detection and enforcement rules</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-semibold text-emerald-400">LIVE</span>
                    </div>
                    <button onClick={() => { setShowCreate(!showCreate); setEditingId(null); setForm({ name: '', description: '', action: 'WARN', priority: 100, conditions: [{ field: 'riskScore', op: 'gte', value: '60' }], enabled: true }) }} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> New Policy
                    </button>
                </div>
            </div>

            {isError && <InlineError message="Failed to load policies." onRetry={() => refetch()} />}

            {/* Policy Test Sandbox */}
            <div className="card border border-brand-500/20 bg-brand-500/5">
                <h3 className="text-sm font-semibold text-brand-400 mb-3 flex items-center gap-2">
                    <Play className="w-4 h-4" /> Policy Test Sandbox
                </h3>
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-slate-400 mb-1">Risk Score</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={testScore}
                                onChange={e => { setTestScore(Number(e.target.value)); setTestResult(null) }}
                                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                            />
                            <span className="text-lg font-bold text-slate-100 tabular-nums w-10 text-right">{testScore}</span>
                        </div>
                    </div>
                    <button onClick={runTest} className="btn-primary">
                        Test Rules
                    </button>
                    {testResult && (
                        <div className={`px-4 py-2 rounded-lg ${testResult === 'BLOCK' ? 'bg-red-500/10 text-red-400' : testResult === 'REDACT' ? 'bg-orange-500/10 text-orange-400' : testResult === 'WARN' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            Result: <span className="font-bold">{testResult}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Create/Edit Form */}
            {showCreate && (
                <div className="card border border-brand-500/20 space-y-4">
                    <h3 className="text-sm font-semibold text-brand-400">{editingId ? 'Edit Policy' : 'New Policy'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input className="input" placeholder="Policy name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        <input className="input" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                        <select className="input" value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
                            <option value="ALLOW">ALLOW</option>
                            <option value="LOG">LOG</option>
                            <option value="WARN">WARN</option>
                            <option value="REDACT">REDACT</option>
                            <option value="BLOCK">BLOCK</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSave} disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending} className="btn-primary flex items-center gap-2">
                            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {editingId ? 'Update' : 'Create'}
                        </button>
                        <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                    </div>
                </div>
            )}

            {/* Policy Rules */}
            {isPending ? (
                <SkeletonTable rows={4} />
            ) : (
                <div className="space-y-3">
                    {(policies || []).length === 0 && !showCreate && (
                        <div className="card text-center py-12 text-slate-500">
                            No policies yet. <button onClick={() => setShowCreate(true)} className="text-brand-400 hover:underline">Create your first policy →</button>
                        </div>
                    )}
                    {(policies || []).map((policy: PolicyRule) => (
                        <div
                            key={policy.id}
                            className={`card-hover transition-all ${!policy.enabled ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-base font-semibold text-slate-100">{policy.name}</h3>
                                        <span className={actionColors[policy.action] || 'badge'}>{policy.action}</span>
                                        <span className="badge bg-slate-800 text-slate-400 border-slate-700">P{policy.priority}</span>
                                    </div>
                                    <p className="text-sm text-slate-400 mb-3">{policy.description || 'No description'}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(policy.conditions || []).map((cond: any, i: number) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 text-xs text-slate-300 font-mono">
                                                {cond.field} <span className="text-brand-400">{cond.op || cond.operator}</span> <span className="text-emerald-400">{String(cond.value)}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={() => handleToggle(policy.id, policy.enabled)}
                                        className={`transition-colors ${policy.enabled ? 'text-emerald-400' : 'text-slate-600'}`}
                                    >
                                        {policy.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                    </button>
                                    <button onClick={() => handleEdit(policy)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(policy.id, policy.name)} className="text-slate-500 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
