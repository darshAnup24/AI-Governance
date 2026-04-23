import { useState } from 'react'
import { Search, Zap } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import govApi from '../../lib/govApi'

const sampleThreats = [
    { id: '1', patternType: 'prompt_injection_jailbreak', severity: 'CRITICAL', detectedAt: '2024-06-01T10:23:00Z', status: 'ACTIVE', details: { matchedText: 'ignore previous instructions', confidence: 0.95 } },
    { id: '2', patternType: 'regulatory_gdpr', severity: 'HIGH', detectedAt: '2024-06-01T09:45:00Z', status: 'ACTIVE', details: { matchedText: 'personal data without consent', confidence: 0.88 } },
    { id: '3', patternType: 'security_sql_injection', severity: 'CRITICAL', detectedAt: '2024-06-01T08:12:00Z', status: 'MITIGATED', details: { matchedText: 'f"SELECT * FROM users WHERE id={user_id}"', confidence: 0.92 } },
    { id: '4', patternType: 'hallucination_fake_citation', severity: 'MEDIUM', detectedAt: '2024-05-31T15:30:00Z', status: 'ACTIVE', details: { matchedText: 'Smith et al. (2023)', confidence: 0.75 } },
    { id: '5', patternType: 'bias_gender', severity: 'HIGH', detectedAt: '2024-05-31T14:00:00Z', status: 'ACTIVE', details: { matchedText: 'female engineer', confidence: 0.65 } },
]

const categoryData = [
    { name: 'Prompt Injection', value: 35, color: '#ef4444' },
    { name: 'Security', value: 25, color: '#f97316' },
    { name: 'Regulatory', value: 20, color: '#eab308' },
    { name: 'Hallucination', value: 12, color: '#22c55e' },
    { name: 'Bias', value: 8, color: '#3b82f6' },
]

const sevColors: Record<string, string> = {
    CRITICAL: 'bg-red-500/10 text-red-400', HIGH: 'bg-orange-500/10 text-orange-400',
    MEDIUM: 'bg-yellow-500/10 text-yellow-400', LOW: 'bg-emerald-500/10 text-emerald-400'
}

export default function ThreatDetection() {
    const [threats] = useState(sampleThreats)
    const [scanText, setScanText] = useState('')
    const [scanResult, setScanResult] = useState<any>(null)
    const [scanning, setScanning] = useState(false)

    const handleScan = async () => {
        if (!scanText.trim()) return
        setScanning(true)
        try {
            const r = await govApi.post('/api/threats/scan', { text: scanText })
            setScanResult(r.data)
        } catch {
            setScanResult({ riskScore: 0, action: 'ALLOW', threatsDetected: 0, euAiActRiskLevel: 'MINIMAL' })
        }
        setScanning(false)
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-100">Threat Detection</h1>

            {/* Manual Scan */}
            <div className="card border border-brand-500/20 bg-brand-500/5">
                <h3 className="text-sm font-semibold text-brand-400 mb-3 flex items-center gap-2">
                    <Search className="w-4 h-4" /> Manual Scan
                </h3>
                <textarea
                    className="input w-full h-28 font-mono text-sm mb-3"
                    placeholder="Paste any text to scan for threats..."
                    value={scanText}
                    onChange={e => setScanText(e.target.value)}
                />
                <div className="flex items-center gap-4">
                    <button onClick={handleScan} disabled={scanning} className="btn-primary flex items-center gap-2">
                        {scanning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                        {scanning ? 'Scanning...' : 'Scan'}
                    </button>
                    {scanResult && (
                        <div className="flex gap-4 text-sm">
                            <span className={scanResult.riskScore >= 70 ? 'text-red-400' : scanResult.riskScore >= 40 ? 'text-yellow-400' : 'text-emerald-400'}>
                                Risk: <strong>{scanResult.riskScore}</strong>
                            </span>
                            <span className="text-slate-400">Action: <strong>{scanResult.action}</strong></span>
                            <span className="text-slate-400">EU AI Act: <strong>{scanResult.euAiActRiskLevel}</strong></span>
                            <span className="text-slate-400">Threats: <strong>{scanResult.threatsDetected}</strong></span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Category Donut */}
                <div className="card">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">By Category</h2>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                                {categoryData.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-1">
                        {categoryData.map(d => (
                            <div key={d.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                                    <span className="text-slate-400">{d.name}</span>
                                </div>
                                <span className="text-slate-300">{d.value}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Threat Table */}
                <div className="card lg:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">Recent Threats</h2>
                    <div className="space-y-2">
                        {threats.map(t => (
                            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${sevColors[t.severity]}`}>{t.severity}</span>
                                        <code className="text-xs text-slate-400">{t.patternType}</code>
                                    </div>
                                    <p className="text-xs text-slate-500 font-mono truncate max-w-md">"{t.details.matchedText}"</p>
                                </div>
                                <div className="text-right text-xs">
                                    <p className="text-slate-500">{new Date(t.detectedAt).toLocaleDateString()}</p>
                                    <p className={t.status === 'ACTIVE' ? 'text-red-400' : 'text-emerald-400'}>{t.status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
