import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { Scan, Shield, MessageSquare, ScrollText, Activity, Server, Database, Wifi, PlayCircle, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import api from '../../lib/api'
import govApi from '../../lib/govApi'
import { useGovernanceProxyStats } from '../../lib/hooks'
import { PageHeader, PageShell, StatusPill, SurfaceSection } from '../../components/ui/page-shell'
import { DemoFlowProvider, GOLDEN_DEMO_PROMPT, useDemoFlow } from './DemoFlowContext'

const TABS = [
  {
    path: '/live-demo/detection',
    label: 'Prompt Inspector',
    icon: Scan,
    color: 'from-blue-500 to-cyan-500',
    desc: 'Real-time content classification & risk scoring',
  },
  {
    path: '/live-demo/policy',
    label: 'Policy Enforcement',
    icon: Shield,
    color: 'from-brand-500 to-purple-500',
    desc: 'Watch dashboard policies block requests live',
  },
  {
    path: '/live-demo/chat',
    label: 'Chat Gateway',
    icon: MessageSquare,
    color: 'from-emerald-500 to-teal-500',
    desc: 'Full proxy chat flow — detection + policy in one',
  },
  {
    path: '/live-demo/audit',
    label: 'Audit & Incidents',
    icon: ScrollText,
    color: 'from-orange-500 to-red-500',
    desc: 'Event log, violations, incident board integration',
  },
  {
    path: '/live-demo/shadow-ai',
    label: 'Shadow AI',
    icon: Wifi,
    color: 'from-yellow-500 to-orange-500',
    desc: 'Simulate unauthorised AI tool usage across the org',
  },
]

interface ServiceStatus { label: string; icon: typeof Server; ok: boolean | null }

function useServiceHealth() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { label: 'Proxy', icon: Shield, ok: null },
    { label: 'Detection', icon: Activity, ok: null },
    { label: 'Governance', icon: Database, ok: null },
  ])

  useEffect(() => {
    const check = async () => {
      const [proxy, detection, gov] = await Promise.all([
        api.get('/health').then(() => true).catch(() => false),
        api.post('/api/v1/inspect', { text: 'health probe' }).then(() => true).catch(() => false),
        govApi.get('/health').then(() => true).catch(() => false),
      ])
      setServices([
        { label: 'Proxy :8000', icon: Shield, ok: proxy },
        { label: 'Detection :8001', icon: Activity, ok: detection },
        { label: 'Governance :4000', icon: Database, ok: gov },
      ])
    }
    check()
    const t = setInterval(check, 10_000)
    return () => clearInterval(t)
  }, [])

  return services
}

export default function DemoLayout() {
  return (
    <DemoFlowProvider>
      <DemoLayoutInner />
    </DemoFlowProvider>
  )
}

function DemoLayoutInner() {
  const { pathname } = useLocation()
  const services = useServiceHealth()
  const runtimeStatsQ = useGovernanceProxyStats()
  const { flowRunning, lastRun, runGoldenFlow, seedReady, seeding, steps, isDemoMode } = useDemoFlow()
  const runtimeStats = runtimeStatsQ.data ?? {}

  if (pathname === '/live-demo' || pathname === '/live-demo/') {
    return <Navigate to="/live-demo/detection" replace />
  }

  const completedSteps = Object.values(steps).filter((step) => step.status === 'done').length
  const activeActionTone =
    lastRun?.action === 'BLOCK'
      ? 'border-red-500/20 bg-red-500/10 text-red-400'
      : lastRun?.action === 'WARN'
        ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

  return (
    <PageShell>
      <PageHeader
        badge="Demo Lab"
        title="Golden demo flow for live AI governance operations"
        description="One traceable path: prompt enters, detection fires, policy blocks, incident opens, telemetry refreshes, and the advisor explains the outcome."
        status={<StatusPill label={flowRunning ? 'Golden Path Running' : 'Golden Path Ready'} tone={flowRunning ? 'live' : 'warning'} pulse />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {services.map(({ label, icon: Icon, ok }) => (
              <div
                key={label}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  ok === null
                    ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                    : ok
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                      : 'border-red-500/20 bg-red-500/10 text-red-500'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </div>
            ))}
            <button
              onClick={() => void runGoldenFlow(GOLDEN_DEMO_PROMPT)}
              disabled={flowRunning || !seedReady}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 disabled:opacity-50"
            >
              <PlayCircle className={`h-4 w-4 ${flowRunning ? 'animate-pulse' : ''}`} />
              <span>{flowRunning ? 'Running Demo…' : 'Run Golden Demo'}</span>
            </button>
          </div>
        }
      />

      <SurfaceSection className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="border-b border-[var(--border)] p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                  {isDemoMode ? 'Demo Mode Seeded' : 'Live Runtime Path'}
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--foreground)]">
                  Sensitive customer data is stopped before OpenAI egress.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                  Use the exact judge prompt below. The same trace should move from gateway interception to incident creation without leaving the existing demo surface.
                </p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 text-right ${activeActionTone}`}>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-80">Latest Action</p>
                <p className="mt-1 text-lg font-semibold">{lastRun?.action || 'READY'}</p>
                <p className="text-xs opacity-80">{lastRun ? `Risk ${lastRun.riskScore}` : 'Awaiting first trace'}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Golden Prompt</p>
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{GOLDEN_DEMO_PROMPT}</pre>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {[
                ['Flow Progress', `${completedSteps}/8`, seedReady ? 'Seeded and ready' : seeding ? 'Seeding baseline demo data' : 'Preparing'],
                ['Policy', lastRun?.policyName || DEMO_POLICY_NAME_SHORT, lastRun?.policySeverity || 'BLOCK'],
                ['Incident', String(runtimeStats.activeIncidents ?? (lastRun?.incidentId ? '1' : '0')), `${lastRun?.incidentTitle || 'Open incident count is live'}`],
                ['Advisor', lastRun?.advisor ? 'Explained' : 'Waiting', lastRun?.complianceImpact?.[0] || lastRun?.advisor?.complianceImpact?.[0] || 'Compliance impact shown'],
              ].map(([label, value, detail]) => (
                <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--background)]/80 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">{value}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Operational Trace</p>
            <div className="mt-4 space-y-3">
              {[
                ['Gateway', steps.gateway, Activity],
                ['Detection', steps.detection, Scan],
                ['Policy', steps.policy, Shield],
                ['Incident', steps.incident, AlertTriangle],
                ['Advisor', steps.advisor, CheckCircle2],
              ].map(([label, step, Icon]: any) => (
                <div key={label} className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)]/80 px-4 py-3">
                  <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                    step.status === 'done'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : step.status === 'running'
                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                        : step.status === 'error'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{label}</p>
                    <p className="text-xs leading-5 text-[var(--muted-foreground)]">{step.detail || 'Waiting for the golden flow to run.'}</p>
                  </div>
                </div>
              ))}
            </div>

            {lastRun ? (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Last Trace</p>
                <div className="mt-3 grid gap-2 text-sm text-[var(--foreground)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted-foreground)]">Trace ID</span>
                    <span className="font-mono text-xs">{lastRun.traceId.slice(0, 18)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted-foreground)]">Categories</span>
                    <span>{lastRun.categories.join(', ') || 'None'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted-foreground)]">Provider</span>
                    <span>{lastRun.provider}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </SurfaceSection>

      <SurfaceSection className="p-3">
        <div className="tab-strip">
          {TABS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `tab-chip ${isActive ? 'tab-chip-active' : ''}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </SurfaceSection>

      <Outlet />
    </PageShell>
  )
}

const DEMO_POLICY_NAME_SHORT = 'PII -> BLOCK'
