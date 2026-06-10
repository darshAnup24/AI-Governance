import { useState } from 'react'
import { Plus, GripVertical, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useIncidents, useQueryClient, useMutation } from '../../lib/hooks'
import { SkeletonTable } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'
import govApi from '../../lib/govApi'
import { PageHeader, PageShell, StatusPill, SurfaceSection } from '../../components/ui/page-shell'

// ── Types / Constants ─────────────────────────────────────────────────────────

interface Incident {
  id: string; title: string; description: string; severity: string; status: string
  createdAt: string; model?: { name: string }
}

const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'border-l-red-500 bg-red-500/5',
  HIGH:     'border-l-orange-500 bg-orange-500/5',
  MEDIUM:   'border-l-yellow-500 bg-yellow-500/5',
  LOW:      'border-l-emerald-500 bg-emerald-500/5',
}
const SEV_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
  HIGH:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  MEDIUM:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  LOW:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}
const SEV_ICON: Record<string, React.ReactNode> = {
  CRITICAL: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  HIGH:     <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />,
  MEDIUM:   <Clock className="w-3.5 h-3.5 text-yellow-400" />,
  LOW:      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
}

const COLUMNS = ['OPEN', 'INVESTIGATING', 'RESOLVED_CLOSED'] as const
type Column = typeof COLUMNS[number]
const COL_LABELS: Record<Column, string> = {
  OPEN: 'Open', INVESTIGATING: 'Investigating', RESOLVED_CLOSED: 'Resolved',
}
const COL_COLORS: Record<Column, string> = {
  OPEN: 'bg-red-500/5 border-red-500/10',
  INVESTIGATING: 'bg-yellow-500/5 border-yellow-500/10',
  RESOLVED_CLOSED: 'bg-emerald-500/5 border-emerald-500/10',
}

// ── Time helper ───────────────────────────────────────────────────────────────

function daysAgo(d: string) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  return days === 0 ? 'Today' : `${days}d ago`
}

// ── Incident Card ─────────────────────────────────────────────────────────────

function IncidentCard({ inc, onMove, moving }: {
  inc: Incident
  onMove: (id: string, status: string) => void
  moving: boolean
}) {
  return (
    <div className={`p-3 rounded-xl border-l-4 ${SEV_COLORS[inc.severity]} border border-[var(--border)]/30 hover:border-[var(--accent)]/30 transition-colors`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {SEV_ICON[inc.severity]}
            <p className="text-sm font-medium text-[var(--foreground)] leading-tight">{inc.title}</p>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] line-clamp-2 ml-5">{inc.description}</p>
        </div>
        <GripVertical className="w-3.5 h-3.5 text-[var(--muted-foreground)]/40 flex-shrink-0 cursor-grab" />
      </div>

      <div className="flex items-center justify-between mt-3 ml-5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SEV_BADGE[inc.severity]}`}>
            {inc.severity}
          </span>
          {inc.model && <span className="text-[10px] text-[var(--muted-foreground)]/70 truncate max-w-[90px]">{inc.model.name}</span>}
        </div>
        <span className="text-[10px] text-[var(--muted-foreground)]/70">{daysAgo(inc.createdAt)}</span>
      </div>

      {/* Move buttons */}
      {inc.status !== 'RESOLVED_CLOSED' && (
        <div className="flex gap-1.5 mt-2.5 ml-5">
          {inc.status === 'OPEN' && (
            <button
              onClick={() => onMove(inc.id, 'INVESTIGATING')}
              disabled={moving}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              {moving ? <Loader2 className="w-3 h-3 animate-spin" /> : '→'} Investigate
            </button>
          )}
          {inc.status === 'INVESTIGATING' && (
            <button
              onClick={() => onMove(inc.id, 'RESOLVED_CLOSED')}
              disabled={moving}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              {moving ? <Loader2 className="w-3 h-3 animate-spin" /> : '→'} Resolve
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const qc = useQueryClient()
  const { data: incidents, isPending, isError, refetch } = useIncidents()

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      govApi.patch(`/api/incidents/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['incidents'] })
      const prev = qc.getQueryData(['incidents'])
      qc.setQueryData<Incident[]>(['incidents'], old =>
        old?.map(i => i.id === id ? { ...i, status } : i) ?? []
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['incidents'], ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const addMutation = useMutation({
    mutationFn: (payload: any) => govApi.post('/api/incidents', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', severity: 'MEDIUM' })

  const handleAdd = async () => {
    await addMutation.mutateAsync(form)
    setForm({ title: '', description: '', severity: 'MEDIUM' })
    setShowAdd(false)
  }

  const totalOpen = (incidents ?? []).filter((i: Incident) => i.status !== 'RESOLVED_CLOSED').length

  return (
    <PageShell>
      <PageHeader
        badge="Response Workflow"
        title="Incidents"
        description={`${totalOpen} open incidents across the active response queue, with optimistic workflow transitions and triage visibility.`}
        status={<StatusPill label="Live Queue" tone="live" pulse />}
        actions={
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Report Incident
          </button>
        }
      />

      {isError && <InlineError message="Using cached incidents." onRetry={() => refetch()} />}

      {/* Add form */}
      {showAdd && (
        <SurfaceSection title="New Incident Report" className="border border-brand-500/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="input"
              placeholder="Incident title *"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
            <input
              className="input"
              placeholder="Short description"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
            <div className="flex gap-2">
              <select className="input flex-1" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={!form.title || addMutation.isPending}
                className="btn-primary disabled:opacity-50 flex items-center gap-1.5"
              >
                {addMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </SurfaceSection>
      )}

      {/* Kanban */}
      {isPending ? (
        <SkeletonTable rows={3} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colIncidents = (incidents ?? []).filter((i: Incident) => i.status === col)
            return (
              <div key={col}>
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      col === 'OPEN' ? 'bg-red-400' : col === 'INVESTIGATING' ? 'bg-yellow-400' : 'bg-emerald-400'
                    }`} />
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">{COL_LABELS[col]}</h2>
                  </div>
                  <span className="text-xs bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full">
                    {colIncidents.length}
                  </span>
                </div>

                {/* Column body */}
                <div className={`min-h-[240px] p-3 rounded-xl border ${COL_COLORS[col]} space-y-2.5`}>
                  {colIncidents.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-[var(--muted-foreground)]/40">
                      No incidents
                    </div>
                  )}
                  {colIncidents.map((inc: Incident) => (
                    <IncidentCard
                      key={inc.id}
                      inc={inc}
                      onMove={(id, status) => moveMutation.mutate({ id, status })}
                      moving={moveMutation.isPending && moveMutation.variables?.id === inc.id}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
