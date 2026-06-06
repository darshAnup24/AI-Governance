import { useMemo, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight, Flag, Download } from 'lucide-react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { useAuditEvents } from '../lib/hooks'
import { PageHeader, PageShell, StatusPill, SurfaceSection } from '../components/ui/page-shell'

interface Incident {
    id: string
    timestamp: string
    user: string
    department: string
    riskScore: number
    category: string
    action: string
    promptHash: string
    detections: { detector: string; confidence: number; category: string }[]
}

// No sample data, using API
const actionBadge: Record<string, string> = {
    BLOCKED: 'badge-red',
    REDACTED: 'badge-orange',
    WARNED: 'badge-yellow',
    ALLOWED: 'badge-green',
}

function scoreColor(score: number): string {
    if (score >= 80) return 'text-red-400'
    if (score >= 60) return 'text-orange-400'
    if (score >= 30) return 'text-yellow-400'
    return 'text-[var(--muted-foreground)]'
}

export default function IncidentsPage() {
    const { data: auditEvents, isPending, isError, refetch } = useAuditEvents({ limit: 50 })
    const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
    const [actionFilter, setActionFilter] = useState('ALL')
    const [searchQuery, setSearchQuery] = useState('')

    const incidents = useMemo(() => {
        return (auditEvents || []).map((d: any) => {
            const detections = d.detection_results?.detected_spans || []
            const action = d.action_taken === 'BLOCK' ? 'BLOCKED' : d.action_taken === 'REDACT' ? 'REDACTED' : d.action_taken === 'WARN' ? 'WARNED' : 'ALLOWED'

            return {
                id: d.event_id,
                timestamp: d.timestamp ? new Date(d.timestamp).toLocaleString() : 'Unknown',
                user: d.user_id === 'dev-user-001' ? 'EMP-1293' : d.user_id,
                department: 'Engineering',
                riskScore: d.risk_score ?? 0,
                category: detections.length > 0 ? detections[0].category : 'Clean',
                action,
                promptHash: d.prompt_hash?.substring(0, 8) || 'N/A',
                detections: detections.map((det: any) => ({
                    detector: det.detector || 'regex',
                    confidence: det.confidence || 0.9,
                    category: det.category,
                })),
            } as Incident
        })
    }, [auditEvents])

    const filtered = incidents.filter((inc: Incident) => {
        if (actionFilter !== 'ALL' && inc.action !== actionFilter) return false
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            return inc.user.toLowerCase().includes(q) || inc.category.toLowerCase().includes(q) || inc.department.toLowerCase().includes(q)
        }
        return true
    })

    return (
        <PageShell>
            <PageHeader
                badge="Incident Review"
                title="Flagged events and detection details"
                description="Review prompt-level enforcement signals with the same operational framing used throughout the platform."
                status={<StatusPill label="Live Feed" tone="live" pulse />}
            />

            {/* Filter bar */}
            <SurfaceSection className="toolbar">
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by user, category, or department..."
                        className="input w-full pl-10"
                    />
                </div>
                <select className="input" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                    <option value="ALL">All Actions</option>
                    <option value="BLOCKED">Blocked</option>
                    <option value="REDACTED">Redacted</option>
                    <option value="WARNED">Warned</option>
                </select>
            </div>
            </SurfaceSection>

            {isError && (
                <div className="card border border-red-500/20 bg-red-500/5 text-sm text-red-300">
                    Live audit data is temporarily unavailable.
                    <button onClick={() => refetch()} className="ml-2 text-red-200 underline">
                        Retry
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[var(--muted-foreground)] border-b border-[var(--border)]">
                            <th className="pb-3 font-medium">Timestamp</th>
                            <th className="pb-3 font-medium">User</th>
                            <th className="pb-3 font-medium">Dept</th>
                            <th className="pb-3 font-medium text-center">Risk</th>
                            <th className="pb-3 font-medium">Category</th>
                            <th className="pb-3 font-medium text-center">Action</th>
                            <th className="pb-3 font-medium text-right">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!isPending && filtered.map((inc: Incident) => (
                            <tr
                                key={inc.id}
                                className="border-b border-[var(--border)]/30 hover:bg-[var(--muted)]/20 cursor-pointer transition-colors"
                                onClick={() => setSelectedIncident(inc)}
                            >
                                <td className="py-3 text-[var(--muted-foreground)] font-mono text-xs">{inc.timestamp}</td>
                                <td className="py-3 text-[var(--foreground)]">{inc.user}</td>
                                <td className="py-3 text-[var(--muted-foreground)]">{inc.department}</td>
                                <td className="py-3 text-center">
                                    <span className={`font-bold tabular-nums ${scoreColor(inc.riskScore)}`}>{inc.riskScore}</span>
                                </td>
                                <td className="py-3 text-[var(--foreground)]">{inc.category}</td>
                                <td className="py-3 text-center">
                                    <span className={actionBadge[inc.action]}>{inc.action}</span>
                                </td>
                                <td className="py-3 text-right">
                                    <button className="text-[var(--accent)] hover:text-brand-300 text-xs">View →</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {!isPending && filtered.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-[var(--muted-foreground)]">
                        <p>No incidents match your filters</p>
                    </div>
                )}

                {/* Pagination */}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] mt-4">
                    <span className="text-sm text-[var(--muted-foreground)]">{filtered.length} incidents</span>
                    <div className="flex items-center gap-2">
                        <button className="btn-secondary py-1.5 px-3 text-xs" disabled><ChevronLeft className="w-3 h-3" /></button>
                        <span className="text-sm text-[var(--muted-foreground)]">Page 1</span>
                        <button className="btn-secondary py-1.5 px-3 text-xs"><ChevronRight className="w-3 h-3" /></button>
                    </div>
                </div>
            </div>

            {/* Detail Drawer */}
            {selectedIncident && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedIncident(null)} />
                    <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-[var(--background)] border-l border-[var(--border)] z-50 overflow-y-auto animate-slide-right">
                        <div className="p-6 space-y-6">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-[var(--foreground)]">Incident Details</h3>
                                    <p className="text-xs text-[var(--muted-foreground)] font-mono mt-1">#{selectedIncident.promptHash}</p>
                                </div>
                                <button onClick={() => setSelectedIncident(null)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Summary */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[var(--muted)]/50 rounded-lg p-3">
                                    <p className="text-xs text-[var(--muted-foreground)]">Risk Score</p>
                                    <p className={`text-2xl font-bold ${scoreColor(selectedIncident.riskScore)}`}>{selectedIncident.riskScore}</p>
                                </div>
                                <div className="bg-[var(--muted)]/50 rounded-lg p-3">
                                    <p className="text-xs text-[var(--muted-foreground)]">Action</p>
                                    <p className="mt-1"><span className={actionBadge[selectedIncident.action]}>{selectedIncident.action}</span></p>
                                </div>
                                <div className="bg-[var(--muted)]/50 rounded-lg p-3">
                                    <p className="text-xs text-[var(--muted-foreground)]">User</p>
                                    <p className="text-sm text-[var(--foreground)] font-medium">{selectedIncident.user}</p>
                                </div>
                                <div className="bg-[var(--muted)]/50 rounded-lg p-3">
                                    <p className="text-xs text-[var(--muted-foreground)]">Department</p>
                                    <p className="text-sm text-[var(--foreground)] font-medium">{selectedIncident.department}</p>
                                </div>
                            </div>

                            {/* Detection Breakdown */}
                            <div>
                                <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">Detection Breakdown</h4>
                                <div className="space-y-2">
                                    {selectedIncident.detections.map((d, i) => (
                                        <div key={i} className="flex items-center justify-between bg-[var(--muted)]/30 rounded-lg px-4 py-3">
                                            <div>
                                                <p className="text-sm text-[var(--foreground)] font-medium capitalize">{d.detector} Detector</p>
                                                <p className="text-xs text-[var(--muted-foreground)]">{d.category}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${d.confidence >= 0.8 ? 'bg-red-500' : d.confidence >= 0.6 ? 'bg-orange-500' : 'bg-yellow-500'}`}
                                                        style={{ width: `${d.confidence * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-[var(--muted-foreground)] tabular-nums w-10 text-right">{(d.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Radar Chart */}
                            <div>
                                <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">Risk Profile</h4>
                                <ResponsiveContainer width="100%" height={200}>
                                    <RadarChart data={[
                                        { subject: 'API Keys', score: selectedIncident.detections.some(d => d.category === 'API_KEY') ? 90 : 10 },
                                        { subject: 'PII', score: selectedIncident.detections.some(d => d.category === 'PII') ? 80 : 15 },
                                        { subject: 'Credentials', score: selectedIncident.detections.some(d => d.category === 'CREDENTIALS') ? 85 : 10 },
                                        { subject: 'Source Code', score: selectedIncident.detections.some(d => d.category === 'SOURCE_CODE') ? 70 : 10 },
                                        { subject: 'Confidential', score: selectedIncident.detections.some(d => d.category === 'CONFIDENTIAL') ? 65 : 10 },
                                    ]}>
                                        <PolarGrid stroke="#334155" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                        <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button className="btn-primary flex-1 flex items-center justify-center gap-2">
                                    <Flag className="w-4 h-4" /> Mark Reviewed
                                </button>
                                <button className="btn-secondary flex items-center gap-2">
                                    <Download className="w-4 h-4" /> Export
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </PageShell>
    )
}
