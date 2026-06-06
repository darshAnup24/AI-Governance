import { useState } from 'react'
import { Wifi, Play, RefreshCw, Zap, AlertTriangle, ShieldCheck } from 'lucide-react'

const RISK_CONFIG = {
  HIGH: { color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/40', badge: 'bg-red-900/30 border-red-700/40 text-red-400' },
  MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-800/40', badge: 'bg-amber-900/30 border-amber-700/40 text-amber-400' },
  LOW: { color: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-800/40', badge: 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' },
}

interface DetectedService { name: string; domain: string; risk: 'HIGH' | 'MEDIUM' | 'LOW' }
interface ShadowResult { simulationId: string; detected: DetectedService[]; totalServices: number; timestamp: string }
interface AttackResult { attackId: string; vector: string; detected: boolean; categories: string[]; riskScore: number; timestamp: string }

export default function ShadowAISim() {
  const [shadowResult, setShadowResult] = useState<ShadowResult | null>(null)
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null)
  const [shadowLoading, setShadowLoading] = useState(false)
  const [attackLoading, setAttackLoading] = useState(false)
  const [error, setError] = useState('')
  const [customVector, setCustomVector] = useState('')

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('airlock_lab_token')}`, 'Content-Type': 'application/json' })

  const runShadowScan = async () => {
    setShadowLoading(true); setError('')
    try {
      const res = await fetch('/api/demo/shadow-ai/simulate', {
        method: 'POST', headers: authHeader(),
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setShadowResult(await res.json())
    } catch (e: any) { setError(e.message) }
    finally { setShadowLoading(false) }
  }

  const runAttack = async () => {
    setAttackLoading(true); setError('')
    try {
      const res = await fetch('/api/demo/attack/replay', {
        method: 'POST', headers: authHeader(),
        body: JSON.stringify(customVector ? { vector: customVector } : {}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAttackResult(await res.json())
    } catch (e: any) { setError(e.message) }
    finally { setAttackLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500 mb-1">Simulation</p>
        <h1 className="text-2xl font-bold text-gray-100">Shadow AI Simulator</h1>
        <p className="text-sm text-gray-500 mt-1">Simulate unsanctioned AI service detection and adversarial attack replay</p>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/40">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shadow AI Detection */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
            <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2 mb-3">
              <Wifi className="w-4 h-4 text-emerald-400" /> Shadow AI Detection Scan
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Simulate detection of unsanctioned AI tools being used in the org network.
            </p>
            <button
              onClick={runShadowScan}
              disabled={shadowLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              {shadowLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {shadowLoading ? 'Scanning…' : 'Run Detection Scan'}
            </button>
          </div>

          {shadowResult && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-100">Detected Services</h4>
                <span className="text-xs text-gray-500">{shadowResult.detected.length} / {shadowResult.totalServices} found</span>
              </div>
              <div className="space-y-2">
                {shadowResult.detected.map((svc) => {
                  const cfg = RISK_CONFIG[svc.risk]
                  return (
                    <div key={svc.name} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${cfg.bg}`}>
                      <div>
                        <p className="text-sm font-semibold text-gray-200">{svc.name}</p>
                        <p className="text-xs font-mono text-gray-500">{svc.domain}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${cfg.badge}`}>{svc.risk}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-600 font-mono">scan_id: {shadowResult.simulationId?.slice(0, 12)}…</p>
            </div>
          )}
        </div>

        {/* Attack Replay */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Adversarial Attack Replay
            </h3>
            <p className="text-xs text-gray-500">
              Replay known adversarial prompt vectors against the detection engine.
            </p>
            <textarea
              value={customVector}
              onChange={(e) => setCustomVector(e.target.value)}
              placeholder="Custom attack vector (optional — leave blank for random preset)…"
              rows={3}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none font-mono"
            />
            <button
              onClick={runAttack}
              disabled={attackLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              {attackLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {attackLoading ? 'Replaying…' : 'Replay Attack'}
            </button>
          </div>

          {attackResult && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-100">Attack Result</h4>
                {attackResult.detected ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> Detected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> Evaded
                  </span>
                )}
              </div>
              <div className="rounded-lg bg-gray-800/40 p-3 font-mono text-xs text-amber-300 border border-amber-900/30">
                {attackResult.vector}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-gray-800/40 px-3 py-2">
                  <p className="text-[10px] text-gray-500">Risk Score</p>
                  <p className={`text-lg font-bold ${attackResult.riskScore >= 70 ? 'text-red-400' : attackResult.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {attackResult.riskScore}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-800/40 px-3 py-2">
                  <p className="text-[10px] text-gray-500">Categories</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {attackResult.categories.length > 0
                      ? attackResult.categories.map((c) => (
                          <span key={c} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-900/20 text-red-400 border border-red-800/30">{c}</span>
                        ))
                      : <span className="text-[10px] text-gray-600">none</span>
                    }
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-600 font-mono">attack_id: {attackResult.attackId?.slice(0, 12)}…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
