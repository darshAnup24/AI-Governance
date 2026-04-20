import { useState } from 'react'
import { Plus, Trash2, GripVertical, Play, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { usePolicies, useCreatePolicy, useUpdatePolicy, useDeletePolicy, useTogglePolicy } from '../../lib/hooks'
import { SkeletonTable } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'

// ── Types ─────────────────────────────────────────────────────────────────────

type Action = 'ALLOW' | 'LOG' | 'WARN' | 'REDACT' | 'BLOCK'
type Logic = 'AND' | 'OR'
type Operator = 'equals' | 'contains' | 'gte' | 'lte' | 'not_equals'

interface Condition {
  id: string
  field: string
  operator: Operator
  value: string
}

interface PolicyForm {
  name: string
  action: Action
  logic: Logic
  priority: number
  conditions: Condition[]
  enabled: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELDS = ['riskScore', 'category', 'userId', 'orgId', 'role', 'euAiActTier', 'promptLength']
const OPERATORS: { value: Operator; label: string }[] = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
  { value: 'contains', label: 'contains' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
]
const ACTION_COLORS: Record<Action, string> = {
  ALLOW: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  LOG: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  WARN: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  REDACT: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  BLOCK: 'bg-red-500/10 text-red-400 border-red-500/30',
}
const ACTIONS: Action[] = ['ALLOW', 'LOG', 'WARN', 'REDACT', 'BLOCK']

const EMPTY_FORM: PolicyForm = {
  name: '',
  action: 'WARN',
  logic: 'AND',
  priority: 100,
  conditions: [],
  enabled: true,
}

function newCondition(): Condition {
  return { id: crypto.randomUUID(), field: 'riskScore', operator: 'gte', value: '60' }
}

// ── Rule Builder Panel ────────────────────────────────────────────────────────

function RuleBuilder({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
}: {
  form: PolicyForm
  setForm: (f: PolicyForm) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const addCondition = () => setForm({ ...form, conditions: [...form.conditions, newCondition()] })
  const removeCondition = (id: string) =>
    setForm({ ...form, conditions: form.conditions.filter(c => c.id !== id) })
  const updateCondition = (id: string, patch: Partial<Condition>) =>
    setForm({ ...form, conditions: form.conditions.map(c => (c.id === id ? { ...c, ...patch } : c)) })

  return (
    <div className="card border border-brand-500/20 bg-brand-500/3 space-y-5">
      {/* Name + Priority */}
      <div className="flex gap-3">
        <input
          id="policy-name"
          className="input flex-1"
          placeholder="Policy name (e.g. Block credential leakage)"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">Priority</label>
          <input
            type="number"
            className="input w-20 text-center"
            value={form.priority}
            onChange={e => setForm({ ...form, priority: Number(e.target.value) })}
            min={1}
            max={999}
          />
        </div>
      </div>

      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-300">IF</span>
            <button
              onClick={() => setForm({ ...form, logic: form.logic === 'AND' ? 'OR' : 'AND' })}
              className={`px-2.5 py-0.5 rounded text-xs font-bold border transition-colors ${
                form.logic === 'AND'
                  ? 'bg-brand-500/20 text-brand-400 border-brand-500/40'
                  : 'bg-purple-500/20 text-purple-400 border-purple-500/40'
              }`}
            >
              {form.logic}
            </button>
            <span className="text-xs text-slate-500">of these conditions match:</span>
          </div>
          <button onClick={addCondition} className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Condition
          </button>
        </div>

        {form.conditions.length === 0 && (
          <div className="text-center py-8 text-slate-600 text-sm border border-dashed border-slate-700 rounded-lg">
            No conditions yet — this policy will match ALL requests.
            <br />
            <button onClick={addCondition} className="text-brand-400 hover:underline mt-1 text-xs">
              Add your first condition →
            </button>
          </div>
        )}

        <div className="space-y-2">
          {form.conditions.map((cond, idx) => (
            <div key={cond.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/60 group">
              <GripVertical className="w-4 h-4 text-slate-700 cursor-grab flex-shrink-0" />
              {idx > 0 && (
                <span className="text-[10px] text-slate-500 font-bold w-6 text-center flex-shrink-0">
                  {form.logic}
                </span>
              )}
              {idx === 0 && <span className="text-[10px] text-slate-500 w-6 text-center flex-shrink-0">IF</span>}
              <select
                className="input text-xs py-1.5 flex-shrink-0"
                value={cond.field}
                onChange={e => updateCondition(cond.id, { field: e.target.value })}
              >
                {FIELDS.map(f => <option key={f}>{f}</option>)}
              </select>
              <select
                className="input text-xs py-1.5 w-28 flex-shrink-0"
                value={cond.operator}
                onChange={e => updateCondition(cond.id, { operator: e.target.value as Operator })}
              >
                {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                className="input text-xs py-1.5 flex-1 min-w-0"
                value={cond.value}
                onChange={e => updateCondition(cond.id, { value: e.target.value })}
                placeholder="value"
              />
              <button onClick={() => removeCondition(cond.id)} className="text-slate-700 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Action + Save */}
      <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-300">THEN</span>
          <div className="flex gap-1.5">
            {ACTIONS.map(a => (
              <button
                key={a}
                onClick={() => setForm({ ...form, action: a })}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  form.action === a ? ACTION_COLORS[a] : 'bg-transparent text-slate-600 border-slate-700 hover:border-slate-600'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="btn-secondary text-sm py-1.5 px-4">Cancel</button>
          <button
            id="save-policy-btn"
            onClick={onSave}
            disabled={!form.name.trim() || saving}
            className="btn-primary text-sm py-1.5 px-4 flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Policy
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Policy Row ────────────────────────────────────────────────────────────────

function PolicyRow({ policy, onEdit }: { policy: any; onEdit: (p: any) => void }) {
  const [expanded, setExpanded] = useState(false)
  const deleteMutation = useDeletePolicy()
  const toggleMutation = useTogglePolicy()

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3 p-3.5">
        <button
          onClick={() => toggleMutation.mutate({ id: policy.id, enabled: !policy.enabled })}
          className={`flex-shrink-0 transition-colors ${policy.enabled ? 'text-brand-400' : 'text-slate-700'}`}
        >
          {policy.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${policy.enabled ? 'text-slate-200' : 'text-slate-500'}`}>
              {policy.name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${ACTION_COLORS[policy.action as Action]}`}>
              {policy.action}
            </span>
            <span className="text-xs text-slate-600">priority {policy.priority}</span>
            <span className="text-xs text-slate-600">{policy.conditions?.length ?? 0} condition{policy.conditions?.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="text-slate-600 hover:text-slate-400 p-1">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(policy)} className="text-slate-600 hover:text-brand-400 p-1 transition-colors">
            <Play className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { if (confirm(`Delete "${policy.name}"?`)) deleteMutation.mutate(policy.id) }}
            className="text-slate-600 hover:text-red-400 p-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded condition view */}
      {expanded && policy.conditions?.length > 0 && (
        <div className="px-4 pb-3 border-t border-slate-800 pt-3 space-y-1.5">
          {policy.conditions.map((c: Condition, idx: number) => (
            <div key={c.id || idx} className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              {idx > 0 && <span className="text-brand-500 font-bold">{policy.logic}</span>}
              {idx === 0 && <span className="text-slate-600">IF</span>}
              <span className="text-slate-300">{c.field}</span>
              <span className="text-slate-600">{OPERATORS.find(o => o.value === c.operator)?.label ?? c.operator}</span>
              <span className="text-brand-400">"{c.value}"</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono pt-1">
            <span className="text-slate-600">THEN</span>
            <span className={`font-bold ${ACTION_COLORS[policy.action as Action].split(' ')[1]}`}>{policy.action}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const { data: policies, isPending, isError, refetch } = usePolicies()
  const createMutation = useCreatePolicy()
  const updateMutation = useUpdatePolicy()

  const [showBuilder, setShowBuilder] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM)

  const handleNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowBuilder(true)
  }

  const handleEdit = (policy: any) => {
    setEditingId(policy.id)
    setForm({
      name: policy.name,
      action: policy.action,
      logic: policy.logic ?? 'AND',
      priority: policy.priority,
      conditions: policy.conditions ?? [],
      enabled: policy.enabled,
    })
    setShowBuilder(true)
  }

  const handleSave = async () => {
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, ...form })
    } else {
      await createMutation.mutateAsync(form)
    }
    setShowBuilder(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const saving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Policy Builder</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Visual rule builder — IF [condition] THEN [action]
          </p>
        </div>
        <button id="new-policy-btn" onClick={handleNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Policy
        </button>
      </div>

      {isError && <InlineError message="Using cached policy data — governance service may be offline." onRetry={() => refetch()} />}

      {showBuilder && (
        <RuleBuilder
          form={form}
          setForm={setForm}
          onSave={handleSave}
          onCancel={() => { setShowBuilder(false); setEditingId(null) }}
          saving={saving}
        />
      )}

      {isPending ? (
        <SkeletonTable rows={4} />
      ) : (
        <div className="space-y-2">
          {(policies ?? []).length === 0 && !showBuilder && (
            <div className="card text-center py-12 text-slate-500">
              No policies yet.{' '}
              <button onClick={handleNew} className="text-brand-400 hover:underline">Create your first policy →</button>
            </div>
          )}
          {(policies ?? []).map((p: any) => (
            <PolicyRow key={p.id} policy={p} onEdit={handleEdit} />
          ))}
        </div>
      )}
    </div>
  )
}
