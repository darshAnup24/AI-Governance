import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react'
import govApi from '../../lib/govApi'

interface Framework {
    id: string; name: string; questionCount: number; questions: string[]
}

interface Check {
    id: string; framework: string; score: number; status: string
}

const statusColors: Record<string, string> = {
    COMPLIANT: 'text-emerald-400', PARTIALLY_COMPLIANT: 'text-yellow-400',
    IN_PROGRESS: 'text-blue-400', NOT_STARTED: 'text-slate-500', NON_COMPLIANT: 'text-red-400'
}

const statusIcons: Record<string, any> = {
    COMPLIANT: CheckCircle2, PARTIALLY_COMPLIANT: AlertCircle, NON_COMPLIANT: XCircle
}

const fallbackFrameworks: Framework[] = [
    { id: 'EU_AI_ACT', name: 'EU AI ACT', questionCount: 8, questions: ['Is the AI system classified by risk?', 'Human oversight mechanism?', 'Conformity assessment?', 'Transparency documentation?', 'Data governance?', 'Risk management system?', 'Accuracy/robustness/cybersecurity?', 'Post-market monitoring?'] },
    { id: 'ISO_42001', name: 'ISO 42001', questionCount: 6, questions: ['AI management system policy?', 'AI risks identified?', 'Competence requirements?', 'Documented lifecycle?', 'Third-party components managed?', 'Continuous monitoring?'] },
    { id: 'NIST_AI_RMF', name: 'NIST AI RMF', questionCount: 6, questions: ['Risks mapped/categorized?', 'Measurement plan?', 'Governance structures?', 'Stakeholder engagement?', 'Bias/fairness testing?', 'Transparency in decisions?'] },
    { id: 'ISO_27001', name: 'ISO 27001', questionCount: 6, questions: ['ISMS in place?', 'Access controls?', 'Data encryption?', 'Incident response?', 'Business continuity?', 'Third-party assessments?'] },
]

const fallbackChecks: Check[] = [
    { id: '1', framework: 'EU_AI_ACT', score: 72, status: 'PARTIALLY_COMPLIANT' },
    { id: '2', framework: 'ISO_42001', score: 68, status: 'PARTIALLY_COMPLIANT' },
    { id: '3', framework: 'NIST_AI_RMF', score: 81, status: 'COMPLIANT' },
    { id: '4', framework: 'ISO_27001', score: 75, status: 'PARTIALLY_COMPLIANT' },
]

export default function Compliance() {
    const [frameworks] = useState<Framework[]>(fallbackFrameworks)
    const [checks, setChecks] = useState<Check[]>(fallbackChecks)
    const [selected, setSelected] = useState<string | null>(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [gapResult, setGapResult] = useState('')

    useEffect(() => {
        govApi.get('/api/compliance/frameworks').then(r => r.data).catch(() => fallbackFrameworks)
        govApi.get('/api/compliance/checks/org').then(r => setChecks(r.data)).catch(() => { })
    }, [])

    const handleGapAnalysis = async () => {
        setAnalyzing(true)
        try {
            const r = await govApi.post('/api/compliance/gap-analysis/all')
            setGapResult(r.data.gapAnalysis)
        } catch {
            setGapResult('Gap analysis requires Ollama to be running with llama3.1:8b model. Start it with: make pull-models')
        }
        setAnalyzing(false)
    }

    const selectedFw = frameworks.find(f => f.id === selected)
    const selectedCheck = checks.find(c => c.framework === selected)

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Compliance</h1>
                    <p className="text-slate-500 mt-1">Track compliance across regulatory frameworks</p>
                </div>
                <button onClick={handleGapAnalysis} disabled={analyzing} className="btn-primary flex items-center gap-2">
                    {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {analyzing ? 'Analyzing...' : 'Gap Analysis (AI)'}
                </button>
            </div>

            {/* Framework Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {frameworks.map(fw => {
                    const check = checks.find(c => c.framework === fw.id)
                    const score = check?.score ?? 0
                    const StatusIcon = statusIcons[check?.status || ''] || AlertCircle
                    return (
                        <button key={fw.id} onClick={() => setSelected(fw.id === selected ? null : fw.id)}
                            className={`card text-left transition-all ${selected === fw.id ? 'ring-2 ring-brand-500' : ''}`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-slate-200">{fw.name}</h3>
                                <StatusIcon className={`w-5 h-5 ${statusColors[check?.status || 'NOT_STARTED']}`} />
                            </div>
                            <div className="relative w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                                <div className={`h-full rounded-full transition-all duration-700 ${score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${score}%` }} />
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">{fw.questionCount} checks</span>
                                <span className={statusColors[check?.status || 'NOT_STARTED']}>{score}%</span>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Checklist View */}
            {selectedFw && (
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">{selectedFw.name} Checklist</h2>
                    <div className="space-y-3">
                        {selectedFw.questions.map((q, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
                                <input type="checkbox" defaultChecked={i < Math.floor((selectedCheck?.score || 0) / 100 * selectedFw.questionCount)}
                                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-500" />
                                <span className="text-sm text-slate-300">{q}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Gap Analysis Result */}
            {gapResult && (
                <div className="card border border-brand-500/20">
                    <h2 className="text-lg font-semibold text-brand-400 mb-3">AI Gap Analysis</h2>
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{gapResult}</pre>
                </div>
            )}
        </div>
    )
}
