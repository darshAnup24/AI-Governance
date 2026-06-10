import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CheckCircle2,
  FileText,
  FolderKanban,
  Shield,
  Siren,
  Users,
  Workflow,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDashboardStats, useGovernanceProxyStats } from '../../lib/hooks'
import { SkeletonCard, SkeletonChart } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'
import { PageHeader, PageShell, StatusPill, SurfaceSection } from '../../components/ui/page-shell'
import { useGovernanceDemoStream } from '../../lib/live'

function SmallMetric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string | number
  hint?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
        <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p> : null}
    </div>
  )
}

function severityTone(level: string) {
  if (level === 'CRITICAL' || level === 'UNACCEPTABLE') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
  if (level === 'HIGH') return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300'
  if (level === 'MEDIUM' || level === 'LIMITED') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
}

const chartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs shadow-sm">
      <p className="font-medium text-[var(--foreground)]">{label}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">Risk score: {payload[0]?.value ?? '—'}</p>
    </div>
  )
}

export default function GovDashboard() {
  const { data, isPending, isError, refetch } = useDashboardStats()
  const govProxyStats = useGovernanceProxyStats()
  const govStream = useGovernanceDemoStream(100)
  const [uptimeSeconds, setUptimeSeconds] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setUptimeSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const inventory = data?.inventory
  const compliance = data?.compliance
  const risk = data?.risk
  const advisor = data?.advisor
  const audit = data?.audit
  const incidents = data?.incidents
  const reports = data?.reports
  const vendors = data?.vendors
  const liveStats = govProxyStats.data
  const uptimeLabel = `${Math.floor(uptimeSeconds / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((uptimeSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0')}:${(uptimeSeconds % 60).toString().padStart(2, '0')}`

  return (
    <PageShell>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-300/20 bg-[linear-gradient(90deg,rgba(4,120,87,0.18),rgba(15,23,42,0.92))] px-4 py-3 text-sm text-white shadow-[0_10px_40px_rgba(4,120,87,0.15)]">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
          </span>
          <span className="font-semibold">LIVE - Airlock Gateway Active</span>
        </div>
        <span className="text-white/80">Requests intercepted: {liveStats?.totalToday ?? govStream.events.length}</span>
        <span className="text-white/80">Threats blocked today: {liveStats?.blockedToday ?? 0}</span>
        <span className="text-white/80">Uptime: {uptimeLabel}</span>
      </div>

      <PageHeader
        badge="Governance Command Center"
        title="Structured operational modules for AI governance"
        description="Review inventory, framework readiness, operational risk, active incidents, and audit activity from one organized governance surface."
        status={<StatusPill label={isError ? 'Partial Data' : 'Governance Live'} tone={isError ? 'warning' : 'live'} />}
      />

      {isError ? <InlineError message="Some governance modules could not be loaded." onRetry={() => refetch()} /> : null}

      <div className="grid gap-4 md:grid-cols-4">
        {isPending ? (
          Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)
        ) : (
          <>
            <SmallMetric label="Governance Score" value={`${data?.complianceScore ?? 0}%`} hint="Average framework readiness" icon={Shield} />
            <SmallMetric label="Active Incidents" value={data?.activeIncidents ?? 0} hint="Needs review or remediation" icon={Siren} />
            <SmallMetric label="Runtime Blocks" value={data?.blockedEvents24h ?? 0} hint="Blocked events in the last 24h" icon={AlertTriangle} />
            <SmallMetric label="Audit Events" value={data?.auditEvents24h ?? 0} hint="Runtime events in the last 24h" icon={Workflow} />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceSection
          title="AI Inventory"
          description="Central visibility into models, vendors, datasets, and governed environments."
        >
          {isPending || !inventory ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SmallMetric label="Models" value={inventory.totalModels} hint={`${inventory.byStatus.ACTIVE || 0} active`} icon={Boxes} />
                <SmallMetric label="Active Vendors" value={inventory.activeVendors} hint={`${inventory.integrations} total integrations`} icon={Users} />
                <SmallMetric label="Datasets" value={inventory.connectedDatasets} hint="Connected governance datasets" icon={FolderKanban} />
                <SmallMetric label="AI Agents" value={inventory.aiAgents} hint="Assistants, copilots, and bots" icon={Workflow} />
                <SmallMetric label="Applications" value={inventory.applications} hint={`${inventory.workspaces} workspaces in scope`} icon={BookOpen} />
                <SmallMetric label="Environments" value={inventory.environments} hint={`${data?.canaryVersions ?? 0} shadow/canary versions`} icon={CheckCircle2} />
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)]">
                <div className="grid grid-cols-[1.4fr_1fr_0.9fr_0.8fr] border-b border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  <span>Model</span>
                  <span>Workspace</span>
                  <span>Provider</span>
                  <span>Risk</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {inventory.recentModels.map((model: any) => (
                    <div key={model.id} className="grid grid-cols-[1.4fr_1fr_0.9fr_0.8fr] px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-[var(--foreground)]">{model.name}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{model.purpose || 'No purpose documented'}</p>
                      </div>
                      <span className="text-[var(--muted-foreground)]">{model.workspace?.name || 'Shared'}</span>
                      <span className="text-[var(--muted-foreground)]">{model.provider}</span>
                      <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${severityTone(model.riskLevel)}`}>
                        {model.riskLevel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SurfaceSection>

        <SurfaceSection
          title="AI Advisor"
          description="Guided governance actions surfaced from compliance, incidents, and runtime posture."
        >
          {isPending || !advisor ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
          ) : advisor.actions.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
              No urgent governance actions are open right now. This organization is operating within its current baseline.
            </div>
          ) : (
            <div className="space-y-3">
              {advisor.actions.map((item: any) => (
                <div key={item.id} className={`rounded-xl border p-4 ${item.tone === 'danger' ? severityTone('CRITICAL') : item.tone === 'warning' ? severityTone('MEDIUM') : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]'}`}>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm opacity-80">{item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </SurfaceSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SurfaceSection
          title="Compliance Frameworks"
          description="Track framework readiness and quickly spot frameworks that still need operational coverage."
        >
          {isPending || !compliance ? (
            <SkeletonChart height={220} />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {compliance.frameworks.map((framework: any) => (
                  <div key={framework.framework} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{framework.framework.replace(/_/g, ' ')}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{framework.status.replace(/_/g, ' ')}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${framework.score >= 85 ? severityTone('LOW') : framework.score >= 60 ? severityTone('MEDIUM') : severityTone('CRITICAL')}`}>
                        {framework.score}%
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                      <div className="h-full rounded-full bg-[var(--foreground)]" style={{ width: `${framework.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                <p className="text-sm font-medium text-[var(--foreground)]">Readiness Summary</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {data?.complianceScore ?? 0}% average readiness across {compliance.frameworks.length} active frameworks.
                </p>
              </div>
            </>
          )}
        </SurfaceSection>

        <SurfaceSection
          title="Risk Overview"
          description="A restrained operational view of active risk, model posture, vendor exposure, and runtime signals."
        >
          {isPending || !risk ? (
            <SkeletonChart height={220} />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <SmallMetric label="Average Risk" value={risk.averageScore} hint="Average of recent model assessments" icon={Shield} />
                <SmallMetric label="Shadow AI Alerts" value={risk.shadowAlerts.length} hint="Unauthorized tools needing review" icon={AlertTriangle} />
                <SmallMetric label="Threat Detections" value={risk.threats.length} hint="Recent runtime findings" icon={Siren} />
                <SmallMetric label="Critical / High" value={`${(risk.severityCounts.CRITICAL || 0) + (risk.severityCounts.HIGH || 0)}`} hint="Active high-priority incident load" icon={Workflow} />
              </div>
              <div className="mt-5 space-y-3">
                {risk.topItems.map((item: any) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{item.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.detail}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${severityTone(item.level)}`}>
                      {item.level}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SurfaceSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceSection
          title="Audit Trail & Activity"
          description="Chronological visibility into governance changes, runtime enforcement, and operator actions."
        >
          {isPending || !audit ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <SmallMetric label="Runtime Events 24h" value={audit.runtimeEvents24h} hint="All runtime enforcement events" icon={Workflow} />
                <SmallMetric label="Blocked Events 24h" value={audit.blockedEvents24h} hint="Escalated enforcement actions" icon={AlertTriangle} />
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)]">
                <div className="border-b border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Recent Governance Activity
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {audit.recentChanges.map((entry: any) => (
                    <div key={entry.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{entry.action.replace(/_/g, ' ')}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {entry.user?.name || entry.user?.email || 'System'} · {entry.resource}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--muted-foreground)]">{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SurfaceSection>

        <SurfaceSection
          title="Incidents & Enforcement"
          description="Active governance incidents, policy triggers, and current remediation queue."
        >
          {isPending || !incidents ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <SmallMetric label="Open Incidents" value={incidents.openCount} hint="Current governance queue" icon={Siren} />
                <SmallMetric label="Recent Reports" value={reports?.recent.length ?? 0} hint="Generated governance exports" icon={FileText} />
              </div>
              <div className="mt-5 space-y-3">
                {incidents.recent.map((incident: any) => (
                  <div key={incident.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{incident.title}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {incident.model?.name || 'Governance workflow'} · {incident.status.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${severityTone(incident.severity)}`}>
                        {incident.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SurfaceSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SurfaceSection
          title="Model Risk Trend"
          description="Recent risk assessments across the governed model portfolio."
        >
          {isPending || !data?.riskTrend?.length ? (
            <SkeletonChart height={220} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.riskTrend}>
                <defs>
                  <linearGradient id="riskArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--foreground)" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="var(--foreground)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d8" vertical={false} />
                <XAxis dataKey="date" fontSize={11} tickFormatter={(value) => value?.slice(5) ?? ''} />
                <YAxis fontSize={11} domain={[0, 100]} />
                <Tooltip content={chartTooltip} />
                <Area type="monotone" dataKey="score" stroke="var(--foreground)" fill="url(#riskArea)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SurfaceSection>

        <SurfaceSection
          title="Vendor & Reporting Snapshot"
          description="Quick access to recent vendor posture and generated governance evidence."
        >
          {isPending || !vendors || !reports ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Vendor Risk</p>
                {vendors.top.map((vendor: any) => (
                  <div key={vendor.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{vendor.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {Array.isArray(vendor.services) ? vendor.services.slice(0, 2).join(', ') : 'Vendor service'}
                        </p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${severityTone(vendor.riskLevel)}`}>
                        {vendor.riskLevel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Recent Reports</p>
                {reports.recent.map((report: any) => (
                  <div key={report.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                    <p className="text-sm font-medium text-[var(--foreground)]">{report.reportType}</p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {report.format} · {new Date(report.generatedAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SurfaceSection>
      </div>
    </PageShell>
  )
}
