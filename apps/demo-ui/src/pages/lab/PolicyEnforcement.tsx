import { useState } from 'react'
import { Shield, Play, RefreshCw, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'

const PRESET_RULES = [
  { name: 'block_pii', description: 'Block prompts containing PII (SSN, credit card, email)' },
  { name: 'block_jailbreak', description: 'Block jailbreak / prompt injection attempts' },
  { name: 'block_confidential', description: 'Block prompts referencing confidential data' },
  { name: 'redact_names', description: 'Redact person names before forwarding' },
  { name: 'audit_financial', description: 'Flag and audit any financial queries' },
]

interface SimResult {
  simulationId: string
  appliedRules: { rule: string; matched: boolean }[]
  action: 'BLOCK' | 'ALLOW'
  riskScore: number
  simulated: boolean
}

export default function PolicyEnforcement() {
  const [prompt, setPrompt] = useState('')
  const [selectedRules, setSelectedRules] = useState<string[]>(['block_pii', 'block_jailbreak'])
  const [result, setResult] = useState<SimResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleRule = (name: string) =>
    setSelectedRules((prev) => prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name])

  const handleSimulate = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const token = localStorage.getItem('airlock_lab_token')
      const res = await fetch('/api/demo/policy/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, rules: selectedRules.map((name) => ({ name })) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setResult(await res.json())
    } catch (e: any) {
      setError(e.message || 'Simulation failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500 mb-1">Simulation</p>
        <h1 className="text-2xl font-bold text-gray-100">Policy Enforcement</h1>
        <p className="text-sm text-gray-500 mt-1">Simulate policy rules against prompts before deploying to production</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Prompt Input */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> Prompt Under Test
          </h3>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a prompt to test against the selected policies..."
            rows={6}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none font-mono"
          />
          <button
            onClick={handleSimulate}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {loading ? 'Simulating…' : 'Run Simulation'}
          </button>
          {error && <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/40">{error}</p>}
        </div>

        {/* Rule Selector */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-100">Active Policy Rules</h3>
          <div className="space-y-2">
            {PRESET_RULES.map((rule) => {
              const active = selectedRules.includes(rule.name)
              return (
                <button
                  key={rule.name}
                  onClick={() => toggleRule(rule.name)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors text-sm ${
                    active
                      ? 'border-emerald-600/50 bg-emerald-900/20 text-emerald-300'
                      : 'border-gray-700 bg-gray-800/30 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {active ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-600" />}
                  <div>
                    <p className="font-mono text-xs font-semibold">{rule.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-100">Simulation Result</h3>
            <div className="flex items-center gap-2">
              {result.simulated && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">Simulated</span>
              )}
              <span className={`px-3 py-1 rounded-lg text-sm font-bold ${result.action === 'BLOCK' ? 'bg-red-900/30 text-red-400 border border-red-700/40' : 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/40'}`}>
                {result.action}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-800/50 px-4 py-3">
              <p className="text-xs text-gray-500">Risk Score</p>
              <p className={`text-2xl font-bold mt-1 ${result.riskScore >= 70 ? 'text-red-400' : result.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {result.riskScore}<span className="text-sm font-normal text-gray-500">/100</span>
              </p>
            </div>
            <div className="rounded-lg bg-gray-800/50 px-4 py-3">
              <p className="text-xs text-gray-500">Rules Evaluated</p>
              <p className="text-2xl font-bold text-gray-100 mt-1">{result.appliedRules.length}</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Rule Matches</p>
            {result.appliedRules.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-800">
                <div className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 text-gray-600" />
                  <span className="font-mono text-xs text-gray-300">{r.rule}</span>
                </div>
                <span className={`text-xs font-semibold ${r.matched ? 'text-red-400' : 'text-gray-600'}`}>
                  {r.matched ? 'MATCHED' : 'no match'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

