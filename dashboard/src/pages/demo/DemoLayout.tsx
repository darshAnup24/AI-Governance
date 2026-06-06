import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { Scan, Shield, MessageSquare, ScrollText, Activity, Server, Database, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import api from '../../lib/api'
import govApi from '../../lib/govApi'
import { PageHeader, PageShell, StatusPill, SurfaceSection } from '../../components/ui/page-shell'

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
        api.get('/api/v1/health').then(() => true).catch(() => false),
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
  const { pathname } = useLocation()
  const services = useServiceHealth()

  if (pathname === '/live-demo' || pathname === '/live-demo/') {
    return <Navigate to="/live-demo/detection" replace />
  }

  return (
    <PageShell>
      <PageHeader
        badge="Demo Lab"
        title="Interactive end-to-end Airlock scenarios"
        description="Use the same design language as the governance platform while keeping every demo flow clearly isolated from production contexts."
        status={<StatusPill label="Sandboxed Scope" tone="warning" pulse />}
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
          </div>
        }
      />

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
