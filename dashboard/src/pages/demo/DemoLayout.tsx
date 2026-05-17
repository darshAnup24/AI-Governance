import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { Scan, Shield, MessageSquare, ScrollText, Zap, Activity, Server, Database, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import api from '../../lib/api'
import govApi from '../../lib/govApi'

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
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Live Demo Center</h1>
            <p className="text-slate-500 text-sm">Interactive end-to-end demos of every ShieldAI capability</p>
          </div>
        </div>

        {/* Service health pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {services.map(({ label, icon: Icon, ok }) => (
            <div
              key={label}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                ${ok === null ? 'bg-slate-800 border-slate-700 text-slate-500'
                  : ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                       : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
            >
              <Icon className="w-3 h-3" />
              <span>{label}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${ok === null ? 'bg-slate-600' : ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-0 border-b border-slate-800">
        {TABS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-all whitespace-nowrap
               ${isActive
                 ? 'border-brand-500 text-brand-300 bg-brand-500/5'
                 : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600 hover:bg-slate-800/30'}`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </div>

      {/* ── Sub-page content ── */}
      <Outlet />
    </div>
  )
}
