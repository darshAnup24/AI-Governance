import { useState } from 'react'
import {
  Wifi, ShieldOff, CheckCircle2, Loader2, Info,
  ArrowRight, RefreshCw, ExternalLink, User, Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useQueryClient } from '../../lib/hooks'

const PROXY_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const CAT_COLORS: Record<string, string> = {
  LLM_CHATBOT:  'bg-red-500/10 text-red-300 border-red-500/20',
  AI_CODING:    'bg-orange-500/10 text-orange-300 border-orange-500/20',
  AI_WRITING:   'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  AI_IMAGE:     'bg-purple-500/10 text-purple-300 border-purple-500/20',
  AI_SEARCH:    'bg-blue-500/10 text-blue-300 border-blue-500/20',
  AI_AUDIO:     'bg-pink-500/10 text-pink-300 border-pink-500/20',
}

const SHADOW_PRESETS = [
  { label: 'ChatGPT', tool: 'ChatGPT', domain: 'chat.openai.com', category: 'LLM_CHATBOT', authorized: false, users: ['alice@acme.com', 'bob@acme.com'], dept: 'Marketing' },
  { label: 'Claude.ai', tool: 'Claude.ai', domain: 'claude.ai', category: 'LLM_CHATBOT', authorized: false, users: ['charlie@acme.com'], dept: 'Legal' },
  { label: 'GitHub Copilot', tool: 'GitHub Copilot', domain: 'copilot.github.com', category: 'AI_CODING', authorized: false, users: ['dave@acme.com', 'eve@acme.com'], dept: 'Engineering' },
  { label: 'Cursor', tool: 'Cursor', domain: 'cursor.sh', category: 'AI_CODING', authorized: false, users: ['frank@acme.com'], dept: 'Engineering' },
  { label: 'Grammarly AI', tool: 'Grammarly', domain: 'grammarly.com', category: 'AI_WRITING', authorized: false, users: ['grace@acme.com'], dept: 'HR' },
  { label: 'Midjourney', tool: 'Midjourney', domain: 'midjourney.com', category: 'AI_IMAGE', authorized: false, users: ['henry@acme.com'], dept: 'Design' },
  { label: 'Perplexity', tool: 'Perplexity', domain: 'perplexity.ai', category: 'AI_SEARCH', authorized: false, users: ['iris@acme.com'], dept: 'Sales' },
  { label: '✅ OpenAI API (auth)', tool: 'OpenAI API', domain: 'api.openai.com', category: 'LLM_CHATBOT', authorized: true, users: ['svc-account@acme.com'], dept: 'Platform' },
]

interface Injected {
  tool: string
  users: string[]
  category: string
  authorized: boolean
  count: number
  ts: string
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  return `${Math.floor(d / 3_600_000)}h ago`
}

export default function ShadowAIDemo() {
  const qc = useQueryClient()
  const [injecting, setInjecting] = useState<string | null>(null)
  const [injected, setInjected] = useState<Injected[]>([])
  const [error, setError] = useState<string | null>(null)

  const inject = async (preset: typeof SHADOW_PRESETS[0]) => {
    setInjecting(preset.label)
    setError(null)
    try {
      // Post one event per user in the preset
      await Promise.all(preset.users.map(u =>
        axios.post(`${PROXY_URL}/api/v1/shadow-ai/events`, {
          user_id: u,
          tool_name: preset.tool,
          domain: preset.domain,
          category: preset.category,
          is_authorized: preset.authorized,
        })
      ))

      setInjected(prev => {
        const existing = prev.find(e => e.tool === preset.tool)
        if (existing) {
          return prev.map(e => e.tool === preset.tool
            ? { ...e, count: e.count + preset.users.length, ts: new Date().toISOString() }
            : e)
        }
        return [{
          tool: preset.tool, users: preset.users,
          category: preset.category, authorized: preset.authorized,
          count: preset.users.length, ts: new Date().toISOString(),
        }, ...prev]
      })

      await qc.invalidateQueries({ queryKey: ['shadowAI'] })
    } catch (e: any) {
      setError(e?.message || 'Failed to inject — is the proxy running?')
    }
    setInjecting(null)
  }

  const injectAll = async () => {
    for (const p of SHADOW_PRESETS) {
      await inject(p)
    }
  }

  const unauthorized = injected.filter(e => !e.authorized)
  const authorized = injected.filter(e => e.authorized)

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-200">How Shadow AI Detection works</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
          {['Employee uses external AI tool', 'Network / browser extension detects domain', 'Event sent to proxy :8000', 'Tool classified + risk-rated', 'Appears in Shadow AI page'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">{s}</span>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600" />}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Click a tool below to simulate an employee using it without authorisation. Events are stored in the proxy DB and immediately appear on the{' '}
          <Link to="/shadow-ai" className="text-brand-400 underline hover:text-brand-300">Shadow AI page</Link>.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-400">
          <ShieldOff className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: inject buttons */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-yellow-400" /> Simulate Tool Usage
            </span>
            <button
              onClick={injectAll}
              disabled={injecting !== null}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-brand-500/50 hover:text-brand-300 transition-all disabled:opacity-50 flex items-center gap-1"
            >
              <Zap className="w-3 h-3" /> All tools
            </button>
          </div>

          <div className="space-y-2">
            {SHADOW_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => inject(p)}
                disabled={injecting !== null}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-800 hover:border-slate-600 transition-all disabled:opacity-50 group text-left"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.authorized ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 font-medium group-hover:text-white transition-colors">{p.tool}</p>
                  <p className="text-[10px] text-slate-600">{p.domain} · {p.dept}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${CAT_COLORS[p.category] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {p.category.replace('_', ' ')}
                </span>
                {injecting === p.label
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400 flex-shrink-0" />
                  : <ArrowRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Right: injected events + link */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card border border-slate-800 text-center py-3">
              <p className="text-2xl font-bold text-red-400">{unauthorized.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Shadow tools</p>
            </div>
            <div className="card border border-slate-800 text-center py-3">
              <p className="text-2xl font-bold text-slate-100">{unauthorized.reduce((a, b) => a + b.count, 0)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Events injected</p>
            </div>
            <div className="card border border-slate-800 text-center py-3">
              <p className="text-2xl font-bold text-emerald-400">{authorized.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Authorised tools</p>
            </div>
          </div>

          {/* Injected list */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/50">
              <span className="text-xs font-semibold text-slate-400">Injected This Session</span>
              {injected.length > 0 && (
                <Link to="/shadow-ai" className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 transition-colors">
                  View Shadow AI page <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              )}
            </div>
            {injected.length === 0 ? (
              <div className="py-10 text-center text-slate-700 text-sm">
                Click a tool above to inject shadow AI detections
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {injected.map(ev => (
                  <div key={ev.tool} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/20 transition-colors">
                    {ev.authorized
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      : <ShieldOff className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium">{ev.tool}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {ev.users.map(u => (
                          <span key={u} className="flex items-center gap-1 text-[10px] text-slate-500">
                            <User className="w-2.5 h-2.5" />{u}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${CAT_COLORS[ev.category] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {ev.category.replace('_', ' ')}
                    </span>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-300 font-mono font-bold">{ev.count} events</p>
                      <p className="text-[10px] text-slate-600">{timeAgo(ev.ts)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {injected.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
              <Wifi className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-yellow-300 font-medium">Events saved to proxy DB</p>
                <p className="text-[10px] text-yellow-400/60 mt-0.5">
                  Open Shadow AI page to see them in the bar chart, geo view and trend tab.
                </p>
              </div>
              <Link to="/shadow-ai" className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 whitespace-nowrap">
                <ExternalLink className="w-3 h-3" /> Shadow AI
              </Link>
            </div>
          )}

          {/* Reset note */}
          <p className="text-[10px] text-slate-700 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Events persist in the DB — reload Shadow AI page to see updated graphs
          </p>
        </div>
      </div>
    </div>
  )
}
