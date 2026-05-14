import { useState } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import { useGenerateReport } from '../lib/hooks'
import { InlineError } from '../components/ErrorBoundary'

const reportTypes = [
    { id: 'compliance', name: 'Compliance Summary', desc: 'Overview of policy enforcement and compliance metrics' },
    { id: 'incident', name: 'Incident Report', desc: 'Detailed breakdown of all flagged events' },
    { id: 'department', name: 'Department Risk Analysis', desc: 'Per-department risk scoring and trend analysis' },
    { id: 'shadow', name: 'Shadow AI Report', desc: 'Unauthorized AI tool usage across the organization' },
]

export default function ReportsPage() {
    const [dateRange, setDateRange] = useState('30d')
    const [selectedReport, setSelectedReport] = useState('compliance')
    const [format, setFormat] = useState('pdf')
    const generateMutation = useGenerateReport()

    const handleGenerate = async () => {
        try {
            const blob = await generateMutation.mutateAsync({
                format,
                framework: selectedReport.toUpperCase(),
                dateRange,
            })
            // Download the blob
            const url = window.URL.createObjectURL(new Blob([blob]))
            const link = document.createElement('a')
            link.href = url
            link.setAttribute('download', `shieldai-report-${selectedReport}-${Date.now()}.${format}`)
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch {
            // Error handled by mutation state
        }
    }

    const generating = generateMutation.isPending

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Reports</h1>
                    <p className="text-slate-500 mt-1">Generate compliance and audit reports</p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-400">LIVE</span>
                </div>
            </div>

            {generateMutation.isError && (
                <InlineError message="Report generation failed. Ensure the governance service is running." onRetry={() => generateMutation.reset()} />
            )}

            {/* Config */}
            <div className="card flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Date Range</label>
                    <select className="input" value={dateRange} onChange={e => setDateRange(e.target.value)}>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                        <option value="365d">Last year</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Format</label>
                    <select className="input" value={format} onChange={e => setFormat(e.target.value)}>
                        <option value="pdf">PDF</option>
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                    </select>
                </div>
                <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2">
                    {generating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                    ) : (
                        <><Download className="w-4 h-4" /> Generate Report</>
                    )}
                </button>
            </div>

            {/* Report Type Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reportTypes.map(rt => (
                    <button
                        key={rt.id}
                        onClick={() => setSelectedReport(rt.id)}
                        className={`card-hover text-left transition-all ${selectedReport === rt.id ? 'border-brand-500/50 bg-brand-500/5' : ''}`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedReport === rt.id ? 'bg-brand-500/20' : 'bg-slate-800'}`}>
                                <FileText className={`w-5 h-5 ${selectedReport === rt.id ? 'text-brand-400' : 'text-slate-500'}`} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-200">{rt.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{rt.desc}</p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Preview */}
            <div className="card">
                <h3 className="text-lg font-semibold text-slate-100 mb-4">Report Preview</h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Total Events', value: 'Live data' },
                            { label: 'Blocked', value: 'Live data' },
                            { label: 'Redacted', value: 'Live data' },
                            { label: 'Compliance Rate', value: 'Live data' },
                        ].map(s => (
                            <div key={s.label} className="bg-slate-800/50 rounded-lg p-4 text-center">
                                <p className="text-xs text-slate-500">{s.label}</p>
                                <p className="text-xl font-bold text-slate-100 mt-1">{s.value}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-slate-500 text-center py-4">
                        Click "Generate Report" to download a full report with live data from the backend.
                    </p>
                </div>
            </div>
        </div>
    )
}
