import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, AlertTriangle, Shield, HelpCircle, BarChart3, Loader2, Lightbulb } from 'lucide-react'
import { useAdvisorContext } from '../../lib/hooks'
import govApi from '../../lib/govApi'
import { PageHeader, PageShell, StatusPill } from '../../components/ui/page-shell'

interface Message {
    role: 'USER' | 'ASSISTANT'
    content: string
}

const suggestedQuestions = [
    { icon: AlertTriangle, text: 'What are my highest risks?', color: 'text-red-400' },
    { icon: Shield, text: 'Am I EU AI Act compliant?', color: 'text-blue-400' },
    { icon: Sparkles, text: 'What should I fix first?', color: 'text-yellow-400' },
    { icon: HelpCircle, text: 'Explain ISO 42001 requirements', color: 'text-emerald-400' },
]

export default function Advisor() {
    const ctxQ = useAdvisorContext()
    const ctx = ctxQ.data as any
    const [messages, setMessages] = useState<Message[]>([
        { role: 'ASSISTANT', content: `Welcome to Airlock Advisor! 🛡️\n\nI'm your on-premise AI governance consultant, powered by local LLM inference (no data leaves your system). I specialize in:\n\n• **EU AI Act** compliance\n• **ISO 42001** & ISO 27001\n• **NIST AI RMF** guidance\n• Risk assessment & remediation\n\nHow can I help you today?` }
    ])
    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    const [sessionId] = useState(() => crypto.randomUUID())
    const [recommending, setRecommending] = useState(false)
    const [recommendations, setRecommendations] = useState<any[] | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [messages])

    const send = async (text?: string) => {
        const msg = text || input.trim()
        if (!msg || streaming) return
        setInput('')
        setMessages(prev => [...prev, { role: 'USER', content: msg }])
        setStreaming(true)

        try {
            // Fetch RAG context relevant to the query
            let ragContext = ''
            try {
                const embRes = await govApi.post('/api/advisor/embed-search', { query: msg })
                const embData = embRes.data
                if (embData?.results?.length > 0) {
                    ragContext = '\n\nRelevant telemetry context:\n' + embData.results.slice(0, 5).map((r: any) =>
                        `[${r.source}]: ${r.text.substring(0, 300)}`
                    ).join('\n')
                }
            } catch { /* embed-search is optional enrichment */ }

            const res = await fetch(
                `${import.meta.env.VITE_GOVERNANCE_URL || 'http://localhost:4000'}/api/advisor/chat`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('airlock_token') || ''}`,
                    },
                    body: JSON.stringify({ message: msg + ragContext, sessionId }),
                }
            )

            if (!res.ok || !res.body) {
                setMessages(prev => [...prev, { role: 'ASSISTANT', content: 'Advisor requires Ollama running with llama3.1:8b. Start with: make pull-models && docker compose up' }])
                setStreaming(false)
                return
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let fullText = ''

            setMessages(prev => [...prev, { role: 'ASSISTANT', content: '' }])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.token) {
                            fullText += data.token
                            setMessages(prev => {
                                const updated = [...prev]
                                updated[updated.length - 1] = { role: 'ASSISTANT', content: fullText }
                                return updated
                            })
                        }
                    } catch { /* skip bad JSON */ }
                }
            }
        } catch {
            setMessages(prev => [...prev, { role: 'ASSISTANT', content: '⚠️ Could not connect to advisor. Ensure the governance service and Ollama are running.' }])
        }

        setStreaming(false)
    }

    const getRecommendations = async () => {
        setRecommending(true)
        try {
            const res = await govApi.post('/api/advisor/recommend', {})
            setRecommendations(res.data.recommendations || [])
        } catch { /* offline */ }
        setRecommending(false)
    }

    const SEVERITY_COLORS: Record<string, string> = {
        CRITICAL: 'text-red-400 bg-red-500/10', HIGH: 'text-orange-400 bg-orange-500/10',
        MEDIUM: 'text-yellow-400 bg-yellow-500/10', LOW: 'text-emerald-400 bg-emerald-500/10',
    }

    return (
        <PageShell>
            <PageHeader
                badge="AI Governance Advisor"
                title="Advisor"
                description="Ask governance questions against live platform context with locally hosted inference and policy-aware recommendations."
                status={<StatusPill label="Local LLM" tone="live" pulse />}
            />
        <div className="flex gap-4 h-[calc(100vh-7rem)]">
            {/* Sidebar - Context & Recommendations */}
            <div className="w-80 shrink-0 hidden lg:flex flex-col gap-4 overflow-y-auto">
                {/* Org Context */}
                <div className="card">
                    <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" /> Org Context
                    </h3>
                    {ctxQ.isPending ? (
                        <div className="space-y-2">
                            {[1,2,3,4].map(i => <div key={i} className="h-6 bg-[var(--muted)] rounded animate-pulse" />)}
                        </div>
                    ) : ctx ? (
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Models</span><span className="text-[var(--foreground)] font-mono">{ctx.totalModels}</span></div>
                            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Active Incidents</span><span className="text-red-400 font-mono">{ctx.activeIncidents}</span></div>
                            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Active Threats</span><span className="text-orange-400 font-mono">{ctx.activeThreats}</span></div>
                            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Avg Compliance</span><span className="text-emerald-400 font-mono">{ctx.avgComplianceScore}%</span></div>
                            <div className="pt-2 border-t border-[var(--border)]">
                                <p className="text-[var(--muted-foreground)] mb-1 text-[10px] uppercase tracking-wider">Frameworks</p>
                                {ctx.complianceByFramework?.map((f: any) => (
                                    <div key={f.framework} className="flex justify-between py-0.5">
                                        <span className="text-[var(--muted-foreground)]">{f.framework.replace(/_/g, ' ')}</span>
                                        <span className={`font-mono ${f.score >= 80 ? 'text-emerald-400' : f.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{f.score}%</span>
                                    </div>
                                ))}
                            </div>
                            {ctx.topIncidents?.length > 0 && (
                                <div className="pt-2 border-t border-[var(--border)]">
                                    <p className="text-[var(--muted-foreground)] mb-1 text-[10px] uppercase tracking-wider">Top Incidents</p>
                                    {ctx.topIncidents.map((i: any) => (
                                        <div key={i.title} className="flex items-center gap-1.5 py-0.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[i.severity] || 'bg-[var(--muted-foreground)]/50'}`} />
                                            <span className="text-[var(--muted-foreground)] truncate flex-1">{i.title}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-[var(--muted-foreground)]/70">Context unavailable</p>
                    )}
                </div>

                {/* Recommendations */}
                <div className="card">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-2">
                            <Lightbulb className="w-4 h-4" /> Recommendations
                        </h3>
                        <button onClick={getRecommendations} disabled={recommending} className="text-xs text-[var(--accent)] hover:text-brand-300 disabled:opacity-50">
                            {recommending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Generate'}
                        </button>
                    </div>
                    {recommendations ? (
                        <div className="space-y-2">
                            {recommendations.map((r: any, i: number) => (
                                <div key={i} className="p-2 rounded-lg bg-[var(--muted)]/50 border border-[var(--border)]/50">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                            r.priority === 'HIGH' ? 'text-red-400 bg-red-500/10' :
                                            r.priority === 'MEDIUM' ? 'text-yellow-400 bg-yellow-500/10' :
                                            'text-emerald-400 bg-emerald-500/10'
                                        }`}>{r.priority}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                            r.action === 'BLOCK' ? 'text-red-400 bg-red-500/10' :
                                            r.action === 'WARN' ? 'text-yellow-400 bg-yellow-500/10' :
                                            r.action === 'REDACT' ? 'text-orange-400 bg-orange-500/10' :
                                            'text-emerald-400 bg-emerald-500/10'
                                        }`}>{r.action}</span>
                                    </div>
                                    <p className="text-xs text-[var(--foreground)] font-medium">{r.name}</p>
                                    <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 line-clamp-2">{r.rationale}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-[var(--muted-foreground)]/70">Generate AI-powered policy recommendations based on your org's current telemetry and risks.</p>
                    )}
                </div>

                {/* Suggested Questions */}
                <div className="card">
                    <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Quick Ask</h3>
                    <div className="space-y-1.5">
                        {suggestedQuestions.map((q, i) => (
                            <button key={i} onClick={() => send(q.text)}
                                className="w-full text-left p-2 rounded-lg bg-[var(--muted)]/50 hover:bg-[var(--muted)] transition-colors group flex items-center gap-2">
                                <q.icon className={`w-3.5 h-3.5 ${q.color} group-hover:scale-110 transition-transform shrink-0`} />
                                <span className="text-xs text-[var(--foreground)]">{q.text}</span>
                            </button>
                        ))}
                    </div>
                    <div className="mt-3 p-2.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                        <p className="text-[10px] text-brand-300 font-medium">🔒 On-Premise LLM</p>
                        <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">All inference runs locally. No data leaves your network.</p>
                    </div>
                </div>
            </div>

            {/* Chat */}
            <div className="flex-1 flex flex-col card">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                    <Bot className="w-5 h-5 text-[var(--accent)]" />
                    <h2 className="font-semibold text-[var(--foreground)]">Airlock Advisor</h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Local LLM</span>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === 'USER' ? 'justify-end' : ''}`}>
                            {msg.role === 'ASSISTANT' && (
                                <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0">
                                    <Bot className="w-4 h-4 text-[var(--accent)]" />
                                </div>
                            )}
                            <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'USER' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--foreground)]'
                                }`}>
                                {msg.content || (streaming && i === messages.length - 1 ? (
                                    <span className="text-[var(--muted-foreground)]">Thinking...</span>
                                ) : (
                                    ''
                                ))}
                            </div>
                            {msg.role === 'USER' && (
                                <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center shrink-0">
                                    <User className="w-4 h-4 text-[var(--muted-foreground)]" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
                    <input className="input flex-1" placeholder="Ask about AI governance, compliance, risks..."
                        value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && send()} disabled={streaming} />
                    <button onClick={() => send()} disabled={streaming || !input.trim()} className="btn-primary px-4">
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
        </PageShell>
    )
}
