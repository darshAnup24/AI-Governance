import { useState, useRef } from 'react'
import {
  Wifi, ShieldOff, CheckCircle2, Loader2, Info,
  ArrowRight, RefreshCw, ExternalLink, User, Zap,
  Ban, Plus, X, Globe, Lock, Search, ChevronRight,
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
  { label: 'DeepSeek', tool: 'DeepSeek', domain: 'deepseek.com', category: 'LLM_CHATBOT', authorized: false, users: ['alice@acme.com', 'bob@acme.com'], dept: 'Marketing' },
  { label: 'ChatGPT', tool: 'ChatGPT', domain: 'chat.openai.com', category: 'LLM_CHATBOT', authorized: false, users: ['charlie@acme.com'], dept: 'Legal' },
  { label: 'Claude.ai', tool: 'Claude.ai', domain: 'claude.ai', category: 'LLM_CHATBOT', authorized: false, users: ['dave@acme.com'], dept: 'Legal' },
  { label: 'GitHub Copilot', tool: 'GitHub Copilot', domain: 'copilot.github.com', category: 'AI_CODING', authorized: false, users: ['eve@acme.com', 'frank@acme.com'], dept: 'Engineering' },
  { label: 'Cursor', tool: 'Cursor', domain: 'cursor.sh', category: 'AI_CODING', authorized: false, users: ['grace@acme.com'], dept: 'Engineering' },
  { label: 'Grammarly AI', tool: 'Grammarly', domain: 'grammarly.com', category: 'AI_WRITING', authorized: false, users: ['henry@acme.com'], dept: 'HR' },
  { label: 'Midjourney', tool: 'Midjourney', domain: 'midjourney.com', category: 'AI_IMAGE', authorized: false, users: ['iris@acme.com'], dept: 'Design' },
  { label: 'Perplexity', tool: 'Perplexity', domain: 'perplexity.ai', category: 'AI_SEARCH', authorized: false, users: ['jane@acme.com'], dept: 'Sales' },
  { label: '✅ OpenAI API (auth)', tool: 'OpenAI API', domain: 'api.openai.com', category: 'LLM_CHATBOT', authorized: true, users: ['svc-account@acme.com'], dept: 'Platform' },
]

const DEFAULT_BLOCKED: string[] = [
  'deepseek.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com',
  'perplexity.ai', 'poe.com', 'character.ai', 'huggingface.co',
]

interface Injected {
  tool: string; domain: string; users: string[]
  category: string; authorized: boolean; blocked: boolean
  count: number; ts: string
}

interface TestResult {
  domain: string; blocked: boolean; matchedRule: string | null
  category: string | null; ts: number
}

function normalizeDomain(raw: string): string {
  try {
    const s = raw.trim().toLowerCase()
    return new URL(s.startsWith('http') ? s : `https://${s}`).hostname.replace(/^www\./, '')
  } catch {
    return raw.trim().toLowerCase().replace(/^www\./, '')
  }
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  return `${Math.floor(d / 3_600_000)}h ago`
}

function matchBlocked(domain: string, list: string[]): string | null {
  const d = normalizeDomain(domain)
  return list.find(rule => d === rule || d.endsWith(`.${rule}`)) ?? null
}

export default function ShadowAIDemo() {
  const qc = useQueryClient()
  const [injecting, setInjecting] = useState<string | null>(null)
  const [injected, setInjected] = useState<Injected[]>([])
  const [error, setError] = useState<string | null>(null)

  // Blocklist state
  const [blockedDomains, setBlockedDomains] = useState<string[]>(DEFAULT_BLOCKED)
  const [newDomain, setNewDomain] = useState('')
  const [addError, setAddError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Domain tester state
  const [testInput, setTestInput] = useState('')
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const addDomain = () => {
    const d = normalizeDomain(newDomain)
    if (!d) return
    if (blockedDomains.includes(d)) { setAddError('Already in list'); return }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) { setAddError('Invalid domain'); return }
    setBlockedDomains(prev => [d, ...prev])
    setNewDomain(''); setAddError('')
  }

  const removeDomain = (d: string) => setBlockedDomains(prev => prev.filter(x => x !== d))

  const testDomain = () => {
    if (!testInput.trim()) return
    const d = normalizeDomain(testInput)
    const matched = matchBlocked(d, blockedDomains)
    const preset = SHADOW_PRESETS.find(p => normalizeDomain(p.domain) === d)
    setTestResult({ domain: d, blocked: !!matched, matchedRule: matched, category: preset?.category ?? null, ts: Date.now() })
  }

  const inject = async (preset: typeof SHADOW_PRESETS[0]) => {
    setInjecting(preset.label)
    setError(null)
    const isBlocked = !!matchBlocked(preset.domain, blockedDomains)
    try {
      await Promise.all(preset.users.map(u =>
        axios.post(`${PROXY_URL}/api/v1/shadow-ai/events`, {
          user_id: u, tool_name: preset.tool, domain: preset.domain,
          category: preset.category, is_authorized: preset.authorized,
        })
      ))
      setInjected(prev => {
        const existing = prev.find(e => e.tool === preset.tool)
        if (existing) return prev.map(e => e.tool === preset.tool
          ? { ...e, count: e.count + preset.users.length, ts: new Date().toISOString(), blocked: isBlocked }
          : e)
        return [{ tool: preset.tool, domain: preset.domain, users: preset.users, category: preset.category,
          authorized: preset.authorized, blocked: isBlocked, count: preset.users.length, ts: new Date().toISOString() }, ...prev]
      })
      await qc.invalidateQueries({ queryKey: ['shadowAI'] })
    } catch (e: any) {
      setError(e?.message || 'Failed to inject — is the proxy running?')
    }
    setInjecting(null)
  }

  const injectAll = async () => { for (const p of SHADOW_PRESETS) await inject(p) }

  const unauthorized = injected.filter(e => !e.authorized)
  const blocked = injected.filter(e => e.blocked)

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-200">How Shadow AI Detection works</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
          {['Employee visits AI tool', 'Domain matched against blocklist', 'Event flagged + logged', 'Tool classified + risk-rated', 'Appears in Shadow AI dashboard'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">{s}</span>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600" />}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-400">
          <ShieldOff className="w-3.5 h-3.5 flex-shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Col 1: Blocked Domains Manager ─────────────────────── */}
        <div className="space-y-3">
          <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-400" /> Domain Blocklist
            <span className="ml-auto text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-semibold">
              {blockedDomains.length} blocked
            </span>
          </span>

          {/* Add domain input */}
          <div className="space-y-1">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={newDomain}
                onChange={e => { setNewDomain(e.target.value); setAddError('') }}
                onKeyDown={e => e.key === 'Enter' && addDomain()}
                placeholder="deepseek.com"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500/50 transition-colors"
              />
              <button onClick={addDomain}
                className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:border-red-500/60 text-red-400 hover:text-red-300 transition-all">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {addError && <p className="text-[10px] text-red-400 px-1">{addError}</p>}
          </div>

          {/* Domain list */}
          <div className="border border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {blockedDomains.map(d => (
              <div key={d} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 group">
                <Lock className="w-3 h-3 text-red-400 flex-shrink-0" />
                <span className="flex-1 text-xs text-slate-300 font-mono">{d}</span>
                <button onClick={() => removeDomain(d)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* ── Domain Tester ──────────────────────────────────────── */}
          <div className="card border border-slate-800 space-y-3">
            <p className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-blue-400" /> Test Any Domain
            </p>
            <div className="flex gap-2">
              <input
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && testDomain()}
                placeholder="https://deepseek.com"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              <button onClick={testDomain}
                className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:border-blue-500/60 text-blue-400 hover:text-blue-300 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {testResult && (
              <div className={`rounded-lg p-3 border text-xs animate-fade-in ${testResult.blocked
                ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {testResult.blocked
                    ? <><Ban className="w-4 h-4 text-red-400" /><span className="font-bold text-red-300 text-sm">BLOCKED</span></>
                    : <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="font-bold text-emerald-300 text-sm">ALLOWED</span></>
                  }
                </div>
                <p className="text-slate-400 font-mono">{testResult.domain}</p>
                {testResult.blocked && testResult.matchedRule && (
                  <p className="text-red-400/70 mt-1">Matched rule: <code className="text-red-300">{testResult.matchedRule}</code></p>
                )}
                {testResult.category && (
                  <p className="text-slate-500 mt-1">Category: <span className="text-slate-400">{testResult.category.replace('_', ' ')}</span></p>
                )}
                {!testResult.blocked && (
                  <p className="text-emerald-400/70 mt-1">Not in blocklist — access permitted</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 2-3: Simulate + Events ───────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card border border-red-500/20 bg-red-500/5 text-center py-3">
              <p className="text-2xl font-bold text-red-400">{blocked.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Blocked attempts</p>
            </div>
            <div className="card border border-slate-800 text-center py-3">
              <p className="text-2xl font-bold text-slate-100">{unauthorized.reduce((a, b) => a + b.count, 0)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Events injected</p>
            </div>
            <div className="card border border-slate-800 text-center py-3">
              <p className="text-2xl font-bold text-emerald-400">{blockedDomains.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Domains blocked</p>
            </div>
          </div>

          {/* Simulate buttons */}
          <div className="card border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-yellow-400" /> Simulate Employee Access
              </span>
              <button onClick={injectAll} disabled={injecting !== null}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-brand-500/50 hover:text-brand-300 transition-all disabled:opacity-50 flex items-center gap-1">
                <Zap className="w-3 h-3" /> All tools
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SHADOW_PRESETS.map(p => {
                const isBlocked = !!matchBlocked(p.domain, blockedDomains)
                return (
                  <button key={p.label} onClick={() => inject(p)} disabled={injecting !== null}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all disabled:opacity-50 group text-left
                      ${isBlocked ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50' : 'border-slate-800 hover:border-slate-600'}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isBlocked ? 'bg-red-400' : p.authorized ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 font-medium group-hover:text-white transition-colors truncate">{p.tool}</p>
                      <p className="text-[10px] text-slate-600 truncate">{p.domain}</p>
                    </div>
                    {isBlocked
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400 font-bold flex-shrink-0">BLOCKED</span>
                      : injecting === p.label
                        ? <Loader2 className="w-3 h-3 animate-spin text-brand-400 flex-shrink-0" />
                        : <ArrowRight className="w-3 h-3 text-slate-700 group-hover:text-slate-400 flex-shrink-0" />
                    }
                  </button>
                )
              })}
            </div>
          </div>

          {/* Injected event log */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/50">
              <span className="text-xs font-semibold text-slate-400">Event Log — This Session</span>
              {injected.length > 0 && (
                <Link to="/shadow-ai" className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 transition-colors">
                  View full dashboard <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              )}
            </div>
            {injected.length === 0 ? (
              <div className="py-10 text-center text-slate-700 text-sm">
                Click a tool above to simulate an employee access attempt
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {injected.map(ev => (
                  <div key={ev.tool} className={`flex items-center gap-3 px-4 py-3 transition-colors
                    ${ev.blocked ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-800/20'}`}>
                    {ev.blocked
                      ? <Ban className="w-4 h-4 text-red-400 flex-shrink-0" />
                      : ev.authorized
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        : <ShieldOff className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-slate-200 font-medium">{ev.tool}</p>
                        {ev.blocked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400 font-bold">BLOCKED</span>
                        )}
                      </div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {ev.users.map(u => (
                          <span key={u} className="flex items-center gap-1 text-[10px] text-slate-500">
                            <User className="w-2.5 h-2.5" />{u}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${CAT_COLORS[ev.category] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                        {ev.category.replace('_', ' ')}
                      </span>
                      <p className="text-[10px] text-slate-600">{timeAgo(ev.ts)} · {ev.count} events</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {injected.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
              <Globe className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-yellow-300 font-medium">Events saved to proxy DB</p>
                <p className="text-[10px] text-yellow-400/60 mt-0.5">
                  Open the Shadow AI dashboard to see bar charts, geo view and trend data.
                </p>
              </div>
              <Link to="/shadow-ai" className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 whitespace-nowrap">
                <ExternalLink className="w-3 h-3" /> Shadow AI
              </Link>
            </div>
          )}

          <p className="text-[10px] text-slate-700 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Events persist in DB — reload Shadow AI page to see updated graphs
          </p>
        </div>
      </div>
    </div>
  )
}
