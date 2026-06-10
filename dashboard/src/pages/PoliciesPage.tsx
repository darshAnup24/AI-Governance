import { useState } from 'react'
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { usePolicies, useCreatePolicy, useUpdatePolicy, useDeletePolicy, useTogglePolicy } from '../lib/hooks'
import api from '../lib/api'
import { SkeletonTable } from '../components/Skeletons'
import { InlineError } from '../components/ErrorBoundary'
import { PageHeader, PageShell, StatusPill, SurfaceSection } from '../components/ui/page-shell'

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
    const [testLoading, setTestLoading] = useState(false)
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

    const runTest = async () => {
        setTestLoading(true)
        setTestResult(null)
        try {
            const resp = await api.post('/api/v1/policies/test', {
                risk_score: testScore,
                detection_categories: [],
            })
            setTestResult(resp.data.action || 'ALLOW')
        } catch {
            setTestResult('ERROR')
        } finally {
            setTestLoading(false)
        }
    }

    return (
        <PageShell>
            <PageHeader
                badge="Policy Builder"
                title="Detection and enforcement rules"
                description="Manage reusable controls with the same voice, spacing, and interaction patterns used across the platform."
                status={<StatusPill label="Live Policies" tone="live" pulse />}
                actions={
                    <button onClick={() => { setShowCreate(!showCreate); setEditingId(null); setForm({ name: '', description: '', action: 'WARN', priority: 100, conditions: [{ field: 'riskScore', op: 'gte', value: '60' }], enabled: true }) }} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> New Policy
                    </button>
                }
            />

            {isError && <InlineError message="Failed to load policies." onRetry={() => refetch()} />}

            {/* Policy Test Sandbox */}
            <SurfaceSection
                title="Policy Test Sandbox"
                description="Preview rule outcomes before applying them to live traffic."
                className="border-[var(--accent)]/20 bg-[var(--accent)]/5"
            >
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">Risk Score</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={testScore}
                                onChange={e => { setTestScore(Number(e.target.value)); setTestResult(null) }}
                                className="flex-1 h-2 bg-[var(--muted)] rounded-lg appearance-none cursor-pointer accent-brand-500"
                            />
                            <span className="text-lg font-bold text-[var(--foreground)] tabular-nums w-10 text-right">{testScore}</span>
                        </div>
                    </div>
                    <button onClick={runTest} disabled={testLoading} className="btn-primary flex items-center gap-2">
                        {testLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Test Rules
                    </button>
                    {testResult && (
                        <div className={`px-4 py-2 rounded-lg ${testResult === 'BLOCK' ? 'bg-red-500/10 text-red-400' : testResult === 'REDACT' ? 'bg-orange-500/10 text-orange-400' : testResult === 'WARN' ? 'bg-yellow-500/10 text-yellow-400' : testResult === 'ERROR' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            Result: <span className="font-bold">{testResult === 'ERROR' ? 'Test failed' : testResult}</span>
                        </div>
                    )}
                </div>
            </SurfaceSection>

            {/* Create/Edit Form */}
            {showCreate && (
                <SurfaceSection
                    title={editingId ? 'Edit Policy' : 'New Policy'}
                    description="Keep action, priority, and conditions consistent with the rest of the design system."
                    className="border-[var(--accent)]/20 space-y-4"
                >
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="number" className="input" placeholder="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} />
                        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                            <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} className="accent-brand-500" />
                            Enabled
                        </label>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs text-[var(--muted-foreground)]">Conditions</label>
                        {form.conditions.map((cond, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <select className="input flex-1" value={cond.field} onChange={e => {
                                    const updated = [...form.conditions]
                                    updated[i] = { ...updated[i], field: e.target.value }
                                    setForm({ ...form, conditions: updated })
                                }}>
                                    <option value="riskScore">Risk Score</option>
                                    <option value="category">Category</option>
                                    <option value="provider">Provider</option>
                                    <option value="department">Department</option>
                                    <option value="role">Role</option>
                                </select>
                                <select className="input w-24" value={(cond as any).op || (cond as any).operator || 'gte'} onChange={e => {
                                    const updated = [...form.conditions]
                                    updated[i] = { ...updated[i], op: e.target.value }
                                    setForm({ ...form, conditions: updated })
                                }}>
                                    <option value="gte">&ge; (gte)</option>
                                    <option value="lte">&le; (lte)</option>
                                    <option value="eq">= (eq)</option>
                                    <option value="neq">!= (neq)</option>
                                    <option value="contains">contains</option>
                                </select>
                                <input className="input flex-1" placeholder="Value" value={cond.value} onChange={e => {
                                    const updated = [...form.conditions]
                                    updated[i] = { ...updated[i], value: e.target.value }
                                    setForm({ ...form, conditions: updated })
                                }} />
                                <button onClick={() => {
                                    setForm({ ...form, conditions: form.conditions.filter((_, j) => j !== i) })
                                }} className="text-red-400 hover:text-red-300 p-1">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        <button onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: 'riskScore', op: 'gte', value: '60' }] })} className="text-xs text-[var(--accent)] hover:underline">
                            + Add condition
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSave} disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending} className="btn-primary flex items-center gap-2">
                            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {editingId ? 'Update' : 'Create'}
                        </button>
                        <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                    </div>
                </SurfaceSection>
            )}

            {/* Policy Rules */}
            {isPending ? (
                <SkeletonTable rows={4} />
            ) : (
                <div className="space-y-3">
                    {(policies || []).length === 0 && !showCreate && (
                        <div className="card text-center py-12 text-[var(--muted-foreground)]">
                            No policies yet. <button onClick={() => setShowCreate(true)} className="text-[var(--accent)] hover:underline">Create your first policy →</button>
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
                                        <h3 className="text-base font-semibold text-[var(--foreground)]">{policy.name}</h3>
                                        <span className={actionColors[policy.action] || 'badge'}>{policy.action}</span>
                                        <span className="badge bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]">P{policy.priority}</span>
                                    </div>
                                    <p className="text-sm text-[var(--muted-foreground)] mb-3">{policy.description || 'No description'}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(policy.conditions || []).map((cond: any, i: number) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--muted)]/80 text-xs text-[var(--foreground)] font-mono">
                                                {cond.field} <span className="text-[var(--accent)]">{cond.op || cond.operator}</span> <span className="text-emerald-400">{String(cond.value)}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={() => handleToggle(policy.id, policy.enabled)}
                                        className={`transition-colors ${policy.enabled ? 'text-emerald-400' : 'text-[var(--muted-foreground)]/70'}`}
                                    >
                                        {policy.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                    </button>
                                    <button onClick={() => handleEdit(policy)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(policy.id, policy.name)} className="text-[var(--muted-foreground)] hover:text-red-400 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </PageShell>
    )
}
