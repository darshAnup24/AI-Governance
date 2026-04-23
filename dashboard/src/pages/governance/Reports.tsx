import { useState } from 'react'
import { Download, Loader2, FileText } from 'lucide-react'
import govApi from '../../lib/govApi'

const reportTypes = [
    { id: 'full', title: 'Full Governance Report', desc: 'Complete audit of all models, risks, compliance, incidents' },
    { id: 'compliance', title: 'Compliance Report', desc: 'Framework-specific compliance status and gaps' },
    { id: 'risk', title: 'Risk Assessment Report', desc: 'All model risk assessments with recommendations' },
    { id: 'incident', title: 'Incident Report', desc: 'Incident history, resolution timeline, and trends' },
]

export default function Reports() {
    const [generating, setGenerating] = useState(false)
    const [format, setFormat] = useState('pdf')
    const [framework, setFramework] = useState('')
    const [preview, setPreview] = useState<any>(null)

    const generate = async () => {
        setGenerating(true)
        try {
            if (format === 'json') {
                const r = await govApi.post('/api/reports/generate', { format: 'json', framework })
                setPreview(r.data)
            } else if (format === 'csv') {
                const r = await govApi.post('/api/reports/generate', { format: 'csv', framework }, { responseType: 'blob' })
                const url = window.URL.createObjectURL(new Blob([r.data]))
                const a = document.createElement('a'); a.href = url; a.download = `shieldai-report.csv`; a.click()
            } else {
                const r = await govApi.post('/api/reports/generate', { format: 'pdf', framework }, { responseType: 'blob' })
                const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
                const a = document.createElement('a'); a.href = url; a.download = `shieldai-report.pdf`; a.click()
            }
        } catch {
            setPreview({ error: 'Report generation requires governance service to be running.' })
        }
        setGenerating(false)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-100">Reports</h1>

            {/* Report Types */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {reportTypes.map(rt => (
                    <div key={rt.id} className="card hover:border-brand-500/30 transition-colors border border-transparent">
                        <FileText className="w-5 h-5 text-brand-400 mb-2" />
                        <h3 className="text-sm font-medium text-slate-200">{rt.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">{rt.desc}</p>
                    </div>
                ))}
            </div>

            {/* Report Builder */}
            <div className="card border border-brand-500/20">
                <h3 className="text-sm font-semibold text-brand-400 mb-3">Generate Report</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select className="input" value={format} onChange={e => setFormat(e.target.value)}>
                        <option value="pdf">PDF</option><option value="csv">CSV</option><option value="json">JSON Preview</option>
                    </select>
                    <select className="input" value={framework} onChange={e => setFramework(e.target.value)}>
                        <option value="">All Frameworks</option>
                        <option value="EU_AI_ACT">EU AI Act</option>
                        <option value="ISO_42001">ISO 42001</option>
                        <option value="NIST_AI_RMF">NIST AI RMF</option>
                        <option value="ISO_27001">ISO 27001</option>
                    </select>
                    <div></div>
                    <button onClick={generate} disabled={generating} className="btn-primary flex items-center justify-center gap-2">
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {generating ? 'Generating...' : 'Generate'}
                    </button>
                </div>
            </div>

            {/* JSON Preview */}
            {preview && (
                <div className="card">
                    <h3 className="text-sm font-semibold text-slate-400 mb-3">Preview</h3>
                    <pre className="text-xs text-slate-300 bg-slate-800/50 p-4 rounded-lg overflow-x-auto max-h-96">
                        {JSON.stringify(preview, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    )
}
