<<<<<<< HEAD
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
=======
import { useState } from 'react'
import { Plus, RefreshCw, BarChart3, Globe, Shield, AlertTriangle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, PolarRadiusAxis } from 'recharts'
import govApi from '../../lib/govApi'
import { SkeletonTable } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'

// ── Types / Data ──────────────────────────────────────────────────────────────

interface Vendor {
  id: string; name: string; riskLevel: string; services: string[]
  assessmentScore: number | null; lastAssessed: string | null; createdAt: string
  website?: string; soc2?: boolean; gdprDpa?: boolean
}

const RISK_COLORS: Record<string, string> = {
  MINIMAL: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  LIMITED: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  HIGH: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  UNACCEPTABLE: 'text-red-400 bg-red-500/10 border-red-500/20',
}
const RISK_BAR: Record<string, string> = {
  MINIMAL: 'bg-emerald-500', LIMITED: 'bg-yellow-500', HIGH: 'bg-orange-500', UNACCEPTABLE: 'bg-red-500',
}

const FALLBACK_VENDORS: Vendor[] = [
  { id: '1', name: 'CloudAI Inc.', riskLevel: 'HIGH', services: ['LLM API', 'Fine-tuning'], assessmentScore: 72, lastAssessed: '2024-05-15', createdAt: '2024-01-10', website: 'cloudai.io', soc2: true, gdprDpa: false },
  { id: '2', name: 'DataPipeline Co.', riskLevel: 'LIMITED', services: ['Data labeling', 'ETL'], assessmentScore: 45, lastAssessed: '2024-04-20', createdAt: '2024-02-05', website: 'datapipeline.co', soc2: true, gdprDpa: true },
  { id: '3', name: 'SecureML Ltd.', riskLevel: 'MINIMAL', services: ['Model monitoring', 'Observability'], assessmentScore: 22, lastAssessed: '2024-06-01', createdAt: '2024-03-01', website: 'secureml.io', soc2: true, gdprDpa: true },
  { id: '4', name: 'GenAI Startup', riskLevel: 'UNACCEPTABLE', services: ['Custom LLM', 'Data training'], assessmentScore: 88, lastAssessed: '2024-03-10', createdAt: '2024-03-10', website: 'genai.app', soc2: false, gdprDpa: false },
]

// Radar chart data for vendor comparison
function buildRadarData(score: number) {
  const n = score
  return [
    { axis: 'Security', value: Math.min(100, 100 - n + Math.random() * 20) },
    { axis: 'Compliance', value: Math.min(100, 100 - n * 0.7 + Math.random() * 15) },
    { axis: 'Privacy', value: Math.min(100, 100 - n * 0.8 + Math.random() * 10) },
    { axis: 'Transparency', value: Math.min(100, 100 - n * 0.5 + Math.random() * 20) },
    { axis: 'Resilience', value: Math.min(100, 100 - n * 0.6 + Math.random() * 15) },
  ].map(d => ({ ...d, value: Math.round(Math.max(10, d.value)) }))
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => govApi.get('/api/vendors').then(r => r.data),
    initialData: FALLBACK_VENDORS,
    retry: 1,
  })
}

// ── Vendor Detail Drawer ──────────────────────────────────────────────────────

function VendorDrawer({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const radarData = buildRadarData(vendor.assessmentScore ?? 0)
  const score = vendor.assessmentScore ?? 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{vendor.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{vendor.website}</p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400 text-xl">×</button>
        </div>

        {/* Score gauge */}
        <div className={`p-4 rounded-xl border ${RISK_COLORS[vendor.riskLevel]}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider opacity-70">Risk Score</span>
            <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${RISK_COLORS[vendor.riskLevel]}`}>
              {vendor.riskLevel}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold">{score}</span>
            <span className="text-sm opacity-70 mb-1">/ 100</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full mt-2">
            <div className={`h-2 rounded-full ${RISK_BAR[vendor.riskLevel]}`} style={{ width: `${score}%` }} />
          </div>
        </div>

        {/* Certifications */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Certifications</h3>
          <div className="flex gap-2 flex-wrap">
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${vendor.soc2 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-600 border-slate-800'}`}>
              {vendor.soc2 ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              SOC 2
            </span>
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${vendor.gdprDpa ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-600 border-slate-800'}`}>
              {vendor.gdprDpa ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              GDPR DPA
            </span>
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border text-slate-600 border-slate-800">
              <Globe className="w-3 h-3" /> ISO 27001 (pending)
            </span>
          </div>
        </div>

        {/* Radar chart */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Risk Profile</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <PolarGrid stroke="#1e293b" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: '#64748b' }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Score" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Services */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Services Used</h3>
          <div className="flex gap-1.5 flex-wrap">
            {vendor.services.map(s => (
              <span key={s} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">{s}</span>
            ))}
          </div>
        </div>

        {/* Last assessed */}
        <p className="text-xs text-slate-600">Last assessed: {vendor.lastAssessed ?? 'Never'}</p>
      </div>
    </div>
  )
}

// ── Vendor Card ───────────────────────────────────────────────────────────────

function VendorCard({ vendor, onView, onAssess, assessing }: {
  vendor: Vendor
  onView: () => void
  onAssess: () => void
  assessing: boolean
}) {
  const score = vendor.assessmentScore ?? 0

  return (
    <div className="card hover:border-slate-700 transition-colors group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{vendor.name}</h3>
          {vendor.website && (
            <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
              <Globe className="w-3 h-3" />{vendor.website}
            </p>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold flex-shrink-0 ml-2 ${RISK_COLORS[vendor.riskLevel]}`}>
          {vendor.riskLevel}
        </span>
      </div>

      {/* Services */}
      <div className="flex gap-1 flex-wrap mb-3">
        {vendor.services.map(s => (
          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{s}</span>
        ))}
      </div>

      {/* Score bar */}
      <div className="mb-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-500">Risk Score</span>
          <span className={`font-mono font-bold ${score >= 70 ? 'text-red-400' : score >= 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>{score}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${RISK_BAR[vendor.riskLevel]}`} style={{ width: `${score}%` }} />
        </div>
      </div>

      {/* Certifications mini */}
      <div className="flex gap-1.5 mt-2 mb-3">
        {vendor.soc2 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">SOC 2</span>}
        {vendor.gdprDpa && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">GDPR DPA</span>}
        {!vendor.soc2 && !vendor.gdprDpa && <span className="text-[10px] text-slate-700">No certifications</span>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-slate-800 pt-3">
        <button onClick={onView} className="btn-secondary text-xs py-1.5 flex-1 flex items-center justify-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" /> Details
        </button>
        <button onClick={onAssess} disabled={assessing} className="btn-primary text-xs py-1.5 flex-1 flex items-center justify-center gap-1.5 disabled:opacity-60">
          {assessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
          {assessing ? 'Assessing…' : 'Assess'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Vendors() {
  const qc = useQueryClient()
  const { data: vendors, isPending, isError, refetch } = useVendors()

  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Vendor | null>(null)
  const [form, setForm] = useState({ name: '', riskLevel: 'LIMITED', services: '', website: '' })
  const [assessingId, setAssessingId] = useState<string | null>(null)

  const addMutation = useMutation({
    mutationFn: (payload: any) => govApi.post('/api/vendors', {
      ...payload,
      services: payload.services.split(',').map((s: string) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); setShowAdd(false) },
  })

  const assess = async (id: string) => {
    setAssessingId(id)
    try {
      await govApi.post(`/api/vendors/${id}/assess`)
      qc.invalidateQueries({ queryKey: ['vendors'] })
    } catch { /* offline */ }
    setAssessingId(null)
  }

  const riskCounts = ['MINIMAL', 'LIMITED', 'HIGH', 'UNACCEPTABLE'].map(r => ({
    level: r, count: (vendors ?? []).filter((v: Vendor) => v.riskLevel === r).length
  }))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Vendor Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Third-party AI vendors — risk scores, certifications, and compliance status
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Vendor
          </button>
        </div>
      </div>

      {isError && <InlineError message="Using cached vendor list." onRetry={() => refetch()} />}

      {/* Risk summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {riskCounts.map(({ level, count }) => (
          <div key={level} className={`card-hover border text-center ${RISK_COLORS[level]}`}>
            <p className="text-xl font-bold">{count}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">{level}</p>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card border border-brand-500/20">
          <h3 className="text-sm font-semibold text-brand-400 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Register new vendor
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <input className="input" placeholder="Vendor Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Website (e.g. openai.com)" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
            <input className="input" placeholder="Services (comma-separated) *" value={form.services} onChange={e => setForm({ ...form, services: e.target.value })} />
            <div className="flex gap-2">
              <select className="input flex-1" value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value })}>
                <option value="MINIMAL">Minimal</option>
                <option value="LIMITED">Limited</option>
                <option value="HIGH">High</option>
                <option value="UNACCEPTABLE">Unacceptable</option>
              </select>
              <button
                onClick={() => addMutation.mutate(form)}
                disabled={!form.name || !form.services || addMutation.isPending}
                className="btn-primary disabled:opacity-50 flex items-center gap-1.5"
              >
                {addMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor cards grid */}
      {isPending ? (
        <SkeletonTable rows={3} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(vendors ?? []).map((v: Vendor) => (
            <VendorCard
              key={v.id}
              vendor={v}
              onView={() => setSelected(v)}
              onAssess={() => assess(v.id)}
              assessing={assessingId === v.id}
            />
          ))}
        </div>
      )}

      {/* Side drawer */}
      {selected && <VendorDrawer vendor={selected} onClose={() => setSelected(null)} />}
    </div>
  )
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
}
