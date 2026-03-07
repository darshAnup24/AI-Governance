import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, AlertTriangle, Shield, HelpCircle } from 'lucide-react'
import govApi from '../../lib/govApi'

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
    const [messages, setMessages] = useState<Message[]>([
        { role: 'ASSISTANT', content: `Welcome to ShieldAI Advisor! 🛡️\n\nI'm your on-premise AI governance consultant, powered by local LLM inference (no data leaves your system). I specialize in:\n\n• **EU AI Act** compliance\n• **ISO 42001** & ISO 27001\n• **NIST AI RMF** guidance\n• Risk assessment & remediation\n\nHow can I help you today?` }
    ])
    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    const [sessionId] = useState(() => crypto.randomUUID())
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
            const res = await fetch(
                `${import.meta.env.VITE_GOVERNANCE_URL || 'http://localhost:4000'}/api/advisor/chat`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('shieldai_token') || ''}`,
                    },
                    body: JSON.stringify({ message: msg, sessionId }),
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

    return (
        <div className="flex gap-4 h-[calc(100vh-7rem)] animate-fade-in">
            {/* Sidebar */}
            <div className="w-72 shrink-0 hidden lg:block">
                <div className="card h-full">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Suggested</h3>
                    <div className="space-y-2">
                        {suggestedQuestions.map((q, i) => (
                            <button key={i} onClick={() => send(q.text)}
                                className="w-full text-left p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors group">
                                <div className="flex items-center gap-2">
                                    <q.icon className={`w-4 h-4 ${q.color} group-hover:scale-110 transition-transform`} />
                                    <span className="text-sm text-slate-300">{q.text}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="mt-6 p-3 rounded-lg bg-brand-500/10 border border-brand-500/20">
                        <p className="text-xs text-brand-300 font-medium">🔒 On-Premise AI</p>
                        <p className="text-xs text-slate-500 mt-1">All inference runs locally via Ollama. No data leaves your network.</p>
                    </div>
                </div>
            </div>

            {/* Chat */}
            <div className="flex-1 flex flex-col card">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <Bot className="w-5 h-5 text-brand-400" />
                    <h2 className="font-semibold text-slate-200">ShieldAI Advisor</h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Local LLM</span>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === 'USER' ? 'justify-end' : ''}`}>
                            {msg.role === 'ASSISTANT' && (
                                <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                                    <Bot className="w-4 h-4 text-brand-400" />
                                </div>
                            )}
                            <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'USER' ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-200'
                                }`}>
                                {msg.content || (streaming && i === messages.length - 1 ? (
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                ) : '')}
                            </div>
                            {msg.role === 'USER' && (
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                                    <User className="w-4 h-4 text-slate-400" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-800">
                    <input className="input flex-1" placeholder="Ask about AI governance, compliance, risks..."
                        value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && send()} disabled={streaming} />
                    <button onClick={() => send()} disabled={streaming || !input.trim()} className="btn-primary px-4">
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
