import { useState } from 'react'
import { Shield, Plus, Trash2, Edit, ToggleLeft, ToggleRight, Play, X } from 'lucide-react'

interface PolicyRule {
    rule_id: string
    name: string
    description: string
    action: string
    priority: number
    enabled: boolean
    conditions: {
        operator: string
        conditions: { field: string; op: string; value: string | number }[]
    }
}

const defaultPolicies: PolicyRule[] = [
    {
        rule_id: 'default-block-api-keys',
        name: 'Block API Key Leakage',
        description: 'Automatically block any prompt containing API keys or secrets',
        action: 'BLOCK',
        priority: 10,
        enabled: true,
        conditions: {
            operator: 'AND', conditions: [
                { field: 'risk_score', op: 'gte', value: 90 },
                { field: 'detection.category', op: 'contains', value: 'API_KEY' },
            ]
        },
    },
    {
        rule_id: 'default-redact-pii',
        name: 'Redact PII in Prompts',
        description: 'Redact personally identifiable information before forwarding',
        action: 'REDACT',
        priority: 20,
        enabled: true,
        conditions: {
            operator: 'AND', conditions: [
                { field: 'risk_score', op: 'gte', value: 80 },
                { field: 'detection.category', op: 'contains', value: 'PII' },
            ]
        },
    },
    {
        rule_id: 'default-warn-code',
        name: 'Warn on Source Code',
        description: 'Warn users when source code is detected in prompts',
        action: 'WARN',
        priority: 30,
        enabled: true,
        conditions: {
            operator: 'AND', conditions: [
                { field: 'risk_score', op: 'gte', value: 60 },
                { field: 'detection.category', op: 'contains', value: 'SOURCE_CODE' },
            ]
        },
    },
]

const actionColors: Record<string, string> = {
    BLOCK: 'badge-red',
    REDACT: 'badge-orange',
    WARN: 'badge-yellow',
    ALLOW: 'badge-green',
}

export default function PoliciesPage() {
    const [policies, setPolicies] = useState<PolicyRule[]>(defaultPolicies)
    const [showCreate, setShowCreate] = useState(false)
    const [testResult, setTestResult] = useState<string | null>(null)
    const [testScore, setTestScore] = useState(75)

    const togglePolicy = (ruleId: string) => {
        setPolicies(prev => prev.map(p =>
            p.rule_id === ruleId ? { ...p, enabled: !p.enabled } : p
        ))
    }

    const runTest = () => {
        let result = 'ALLOW'
        for (const policy of policies.filter(p => p.enabled).sort((a, b) => a.priority - b.priority)) {
            const scoreCondition = policy.conditions.conditions.find(c => c.field === 'risk_score')
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
                <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Policy
                </button>
            </div>

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

            {/* Policy Rules */}
            <div className="space-y-3">
                {policies.map((policy) => (
                    <div
                        key={policy.rule_id}
                        className={`card-hover transition-all ${!policy.enabled ? 'opacity-50' : ''}`}
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-base font-semibold text-slate-100">{policy.name}</h3>
                                    <span className={actionColors[policy.action]}>{policy.action}</span>
                                    <span className="badge bg-slate-800 text-slate-400 border-slate-700">P{policy.priority}</span>
                                </div>
                                <p className="text-sm text-slate-400 mb-3">{policy.description}</p>

                                {/* Conditions */}
                                <div className="flex flex-wrap gap-2">
                                    {policy.conditions.conditions.map((cond, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 text-xs text-slate-300 font-mono">
                                            {cond.field}
                                            <span className="text-brand-400">{cond.op}</span>
                                            <span className="text-emerald-400">{String(cond.value)}</span>
                                            {i < policy.conditions.conditions.length - 1 && (
                                                <span className="text-slate-500 ml-1">{policy.conditions.operator}</span>
                                            )}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 ml-4">
                                <button
                                    onClick={() => togglePolicy(policy.rule_id)}
                                    className={`transition-colors ${policy.enabled ? 'text-emerald-400' : 'text-slate-600'}`}
                                >
                                    {policy.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                </button>
                                <button className="text-slate-500 hover:text-slate-300 transition-colors">
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button className="text-slate-500 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
