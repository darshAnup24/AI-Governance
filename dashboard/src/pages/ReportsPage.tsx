import { useState } from 'react'
import { FileText, Download, Calendar, ChevronDown } from 'lucide-react'

const reportTypes = [
    { id: 'compliance', name: 'Compliance Summary', desc: 'Overview of policy enforcement and compliance metrics' },
    { id: 'incident', name: 'Incident Report', desc: 'Detailed breakdown of all flagged events' },
    { id: 'department', name: 'Department Risk Analysis', desc: 'Per-department risk scoring and trend analysis' },
    { id: 'shadow', name: 'Shadow AI Report', desc: 'Unauthorized AI tool usage across the organization' },
]

export default function ReportsPage() {
    const [dateRange, setDateRange] = useState('30d')
    const [selectedReport, setSelectedReport] = useState('compliance')
    const [generating, setGenerating] = useState(false)

    const handleGenerate = () => {
        setGenerating(true)
        setTimeout(() => setGenerating(false), 2000)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Reports</h1>
                    <p className="text-slate-500 mt-1">Generate compliance and audit reports</p>
                </div>
            </div>

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
                    <select className="input">
                        <option>PDF</option>
                        <option>CSV</option>
                        <option>JSON</option>
                    </select>
                </div>
                <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2">
                    {generating ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
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
                            { label: 'Total Events', value: '12,847' },
                            { label: 'Blocked', value: '234' },
                            { label: 'Redacted', value: '1,567' },
                            { label: 'Compliance Rate', value: '98.2%' },
                        ].map(s => (
                            <div key={s.label} className="bg-slate-800/50 rounded-lg p-4 text-center">
                                <p className="text-xs text-slate-500">{s.label}</p>
                                <p className="text-xl font-bold text-slate-100 mt-1">{s.value}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-slate-500 text-center py-4">
                        Full report will be generated in the selected format with detailed breakdowns.
                    </p>
                </div>
            </div>
        </div>
    )
}
