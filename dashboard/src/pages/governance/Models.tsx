<<<<<<< HEAD
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
=======
import { useState } from 'react'
import { Plus, Scan, Trash2, ChevronDown, ChevronUp, Activity, ExternalLink } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import govApi from '../../lib/govApi'
import { SkeletonTable } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AIModel {
  id: string; name: string; provider: string; version: string; purpose: string
  riskLevel: string; status: string; createdAt: string
  riskAssessments?: { overallScore: number }[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  MINIMAL: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  LIMITED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  UNACCEPTABLE: 'bg-red-500/10 text-red-400 border-red-500/30',
}
const RISK_BAR: Record<string, string> = {
  MINIMAL: 'bg-emerald-500', LIMITED: 'bg-yellow-500', HIGH: 'bg-orange-500', UNACCEPTABLE: 'bg-red-500',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-emerald-400', UNDER_REVIEW: 'text-yellow-400', DEPRECATED: 'text-slate-500',
}

const FALLBACK_MODELS: AIModel[] = [
  { id: '1', name: 'GPT Wrapper Service', provider: 'Internal', version: '2.1', purpose: 'Customer support chatbot', riskLevel: 'HIGH', status: 'ACTIVE', createdAt: '2024-01-15', riskAssessments: [{ overallScore: 72 }] },
  { id: '2', name: 'HR Screening Tool', provider: 'Internal', version: '1.0', purpose: 'Resume screening and ranking', riskLevel: 'UNACCEPTABLE', status: 'UNDER_REVIEW', createdAt: '2024-02-01', riskAssessments: [{ overallScore: 91 }] },
  { id: '3', name: 'Customer Chatbot', provider: 'Internal', version: '3.2', purpose: 'FAQ and support', riskLevel: 'LIMITED', status: 'ACTIVE', createdAt: '2024-03-10', riskAssessments: [{ overallScore: 35 }] },
  { id: '4', name: 'Fraud Detector', provider: 'Internal', version: '1.5', purpose: 'Transaction fraud detection', riskLevel: 'HIGH', status: 'ACTIVE', createdAt: '2024-04-20', riskAssessments: [{ overallScore: 78 }] },
  { id: '5', name: 'Internal Search', provider: 'Internal', version: '1.0', purpose: 'Document search and retrieval', riskLevel: 'MINIMAL', status: 'ACTIVE', createdAt: '2024-05-15', riskAssessments: [{ overallScore: 12 }] },
]

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => govApi.get('/api/models').then(r => r.data),
    initialData: FALLBACK_MODELS,
    retry: 1,
  })
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, riskLevel }: { score: number; riskLevel: string }) {
  return (
    <div className="flex items-center gap-2 w-32">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${RISK_BAR[riskLevel] || 'bg-slate-600'}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-bold w-7 text-right ${score >= 70 ? 'text-red-400' : score >= 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
        {score}
      </span>
    </div>
  )
}

// ── Model Row ─────────────────────────────────────────────────────────────────

function ModelRow({ model }: { model: AIModel }) {
  const [expanded, setExpanded] = useState(false)
  const qc = useQueryClient()

  const scanMutation = useMutation({
    mutationFn: (id: string) => govApi.post(`/api/models/${id}/scan`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => govApi.delete(`/api/models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })

  const score = model.riskAssessments?.[0]?.overallScore ?? 0

  return (
    <>
      <tr className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
        <td className="py-3 pl-1">
          <div className="flex items-center gap-2">
            <button onClick={() => setExpanded(!expanded)} className="text-slate-600 hover:text-slate-400 transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <div>
              <span className="text-slate-200 font-medium text-sm">{model.name}</span>
              <span className="text-xs text-slate-600 ml-2">v{model.version}</span>
            </div>
          </div>
        </td>
        <td className="py-3 text-slate-400 text-sm">{model.provider}</td>
        <td className="py-3 text-slate-400 text-xs max-w-[180px] truncate">{model.purpose}</td>
        <td className="py-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${RISK_COLORS[model.riskLevel] || ''}`}>
            {model.riskLevel}
          </span>
        </td>
        <td className="py-3">
          <ScoreBar score={score} riskLevel={model.riskLevel} />
        </td>
        <td className="py-3">
          <span className={`text-xs font-medium ${STATUS_COLORS[model.status] || 'text-slate-400'}`}>
            {model.status.replace('_', ' ')}
          </span>
        </td>
        <td className="py-3 pr-1">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => scanMutation.mutate(model.id)}
              disabled={scanMutation.isPending}
              title="Run risk scan"
              className="text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
            >
              {scanMutation.isPending
                ? <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                : <Scan className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { if (confirm(`Delete ${model.name}?`)) deleteMutation.mutate(model.id) }}
              className="text-slate-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr className="border-b border-slate-800/30">
          <td colSpan={7} className="pb-3 pt-1 px-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/30 text-xs">
                <p className="text-slate-500 mb-1">Added</p>
                <p className="text-slate-300">{new Date(model.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/30 text-xs">
                <p className="text-slate-500 mb-1">Risk Assessments</p>
                <p className="text-slate-300">{model.riskAssessments?.length ?? 0} on record</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/30 text-xs">
                <p className="text-slate-500 mb-1">Last Score</p>
                <p className={`font-bold ${score >= 70 ? 'text-red-400' : score >= 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                  {score} / 100
                </p>
              </div>
            </div>
            {model.riskLevel === 'UNACCEPTABLE' && (
              <div className="mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                This model is classified as UNACCEPTABLE risk under EU AI Act. Immediate review required.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Models() {
  const { data: models, isPending, isError, refetch } = useModels()
  const qc = useQueryClient()

  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterRisk, setFilterRisk] = useState('ALL')
  const [form, setForm] = useState({ name: '', provider: 'Internal', version: '1.0', purpose: '', riskLevel: 'LIMITED' })

  const addMutation = useMutation({
    mutationFn: (payload: any) => govApi.post('/api/models', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setShowAdd(false) },
  })

  const filtered = (models ?? []).filter((m: AIModel) => {
    const q = search.toLowerCase()
    const matchSearch = !q || m.name.toLowerCase().includes(q) || m.purpose.toLowerCase().includes(q)
    const matchRisk = filterRisk === 'ALL' || m.riskLevel === filterRisk
    return matchSearch && matchRisk
  })

  const riskCounts = ['MINIMAL', 'LIMITED', 'HIGH', 'UNACCEPTABLE'].map(r => ({
    level: r, count: (models ?? []).filter((m: AIModel) => m.riskLevel === r).length
  }))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Model Registry</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {(models ?? []).length} models tracked · Manage and assess your AI inventory
          </p>
        </div>
        <button id="add-model-btn" onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Model
        </button>
      </div>

      {isError && <InlineError message="Using cached model registry." onRetry={() => refetch()} />}

      {/* Risk summary pills */}
      <div className="flex gap-3 flex-wrap">
        {riskCounts.map(({ level, count }) => (
          <button
            key={level}
            onClick={() => setFilterRisk(filterRisk === level ? 'ALL' : level)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              filterRisk === level
                ? RISK_COLORS[level]
                : 'bg-transparent text-slate-500 border-slate-700 hover:border-slate-600'
            }`}
          >
            <span>{level}</span>
            <span className="font-bold">{count}</span>
          </button>
        ))}
        <button
          onClick={() => setFilterRisk('ALL')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            filterRisk === 'ALL'
              ? 'bg-brand-500/10 text-brand-400 border-brand-500/30'
              : 'text-slate-500 border-slate-700 hover:border-slate-600'
          }`}
        >
          All ({(models ?? []).length})
        </button>
      </div>

      {/* Search bar */}
      <input
        className="input w-full max-w-sm"
        placeholder="Search models by name or purpose…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Add form */}
      {showAdd && (
        <div className="card border border-brand-500/20">
          <h3 className="text-sm font-semibold text-brand-400 mb-3">Register new AI model</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <input className="input" placeholder="Model Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Provider" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} />
            <input className="input" placeholder="Version" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} />
            <input className="input md:col-span-2" placeholder="Purpose / Use Case *" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
            <div className="flex gap-2">
              <select className="input flex-1" value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value })}>
                <option value="MINIMAL">Minimal</option>
                <option value="LIMITED">Limited</option>
                <option value="HIGH">High</option>
                <option value="UNACCEPTABLE">Unacceptable</option>
              </select>
              <button
                onClick={() => addMutation.mutate(form)}
                disabled={!form.name || !form.purpose || addMutation.isPending}
                className="btn-primary disabled:opacity-50"
              >
                {addMutation.isPending ? 'Saving…' : 'Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {isPending ? (
        <SkeletonTable rows={5} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-800">
                {['Model', 'Provider', 'Purpose', 'Risk Level', 'Score', 'Status', ''].map(h => (
                  <th key={h} className="text-left py-3 text-xs text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-600">No models match the current filter.</td></tr>
              ) : (
                filtered.map((m: AIModel) => <ModelRow key={m.id} model={m} />)
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* EU AI Act callout */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-sm">
        <ExternalLink className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-slate-400">
          <strong className="text-blue-400">EU AI Act Tip:</strong> Any model classified as HIGH or UNACCEPTABLE risk requires a conformity assessment before deployment. Use the <em>Scan</em> button to trigger an automated assessment.
        </p>
      </div>
    </div>
  )
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
}
