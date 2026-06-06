import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Boxes, CheckCircle2, Shield, Activity, Bot,
  AlertTriangle, Users, BarChart3, Settings, Wifi, Menu, X,
  LogOut, ChevronDown, Shield as ShieldIcon, FileText, Building2,
  Layers, Eye, TrendingUp, Database, Lock, ChevronRight,
  Bell, Search, Cpu,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import WorkspaceSwitcher from '../components/WorkspaceSwitcher'
import OnboardingWizard from '../components/onboarding/OnboardingWizard'

/* ─── Navigation structure with grouped modules ─── */
const NAV_GROUPS = [
  {
    label: 'Monitoring',
    items: [
      { to: '/governance', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { to: '/governance/incidents', label: 'Incidents', icon: AlertTriangle },
      { to: '/governance/proxy-monitor', label: 'Runtime Monitor', icon: Eye },
      { to: '/governance/shadow-ai', label: 'Shadow AI', icon: Wifi },
      { to: '/governance/audit-log', label: 'Audit Log', icon: FileText },
    ],
  },
  {
    label: 'Governance',
    items: [
      { to: '/governance/policies', label: 'Policies', icon: Shield },
      { to: '/governance/policy-templates', label: 'Policy Templates', icon: Layers },
      { to: '/governance/compliance', label: 'Compliance', icon: CheckCircle2 },
      { to: '/governance/models', label: 'AI Inventory', icon: Boxes },
      { to: '/governance/vendors', label: 'Vendors', icon: Database },
    ],
  },
  {
    label: 'Risk & Analytics',
    items: [
      { to: '/governance/advisor', label: 'AI Advisor', icon: Bot },
      { to: '/governance/heatmap', label: 'User Heatmap', icon: Activity },
      { to: '/governance/reports', label: 'Reports', icon: BarChart3 },
      { to: '/governance/usage', label: 'Usage & Billing', icon: TrendingUp },
    ],
  },
]

/* ─── Role-based visibility ─── */
const ROLE_KEYS: Record<string, string[]> = {
  OWNER: ['governance', 'incidents', 'proxy-monitor', 'shadow-ai', 'audit-log', 'policies', 'policy-templates', 'compliance', 'models', 'vendors', 'advisor', 'heatmap', 'reports', 'usage'],
  ADMIN: ['governance', 'incidents', 'proxy-monitor', 'shadow-ai', 'audit-log', 'policies', 'policy-templates', 'compliance', 'models', 'vendors', 'advisor', 'heatmap', 'reports', 'usage'],
  SECURITY_ADMIN: ['governance', 'incidents', 'proxy-monitor', 'audit-log', 'policies', 'policy-templates', 'compliance', 'models', 'heatmap', 'reports', 'advisor'],
  COMPLIANCE_OFFICER: ['governance', 'compliance', 'incidents', 'reports', 'audit-log'],
  AI_ENGINEER: ['governance', 'models', 'advisor', 'incidents', 'proxy-monitor'],
  DEVELOPER: ['governance', 'models', 'proxy-monitor', 'shadow-ai'],
  ANALYST: ['governance', 'incidents', 'heatmap', 'reports', 'audit-log'],
  VIEWER: ['governance', 'compliance', 'reports'],
  AUDITOR: ['governance', 'audit-log', 'reports', 'compliance'],
  INCIDENT_RESPONDER: ['governance', 'incidents', 'heatmap', 'proxy-monitor'],
}

function getNavKey(to: string): string {
  const parts = to.replace('/governance/', '').replace('/governance', '')
  return parts || 'governance'
}

function isVisible(to: string, role: string): boolean {
  const allowed = ROLE_KEYS[role] || ROLE_KEYS.VIEWER
  const key = getNavKey(to)
  return allowed.includes(key === '' ? 'governance' : key)
}

/* ─── NavItem component ─── */
function NavLink({ item, active, onClick }: { item: { to: string; label: string; icon: any }; active: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`nav-item ${active ? 'active' : ''}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (user) {
      const prefs = user.preferences as any
      if (prefs?.onboardingComplete === false) setShowOnboarding(true)
    }
  }, [user])

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const role = user?.role || 'VIEWER'

  function isActive(to: string, exact?: boolean) {
    if (exact) return location.pathname === to
    return location.pathname === to || location.pathname.startsWith(to + '/')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)', fontFamily: 'var(--font-body)' }}>
      <OnboardingWizard open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ═══ SIDEBAR ═══ */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-60 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <div className="w-7 h-7 rounded-lg gradient-icon-bg flex items-center justify-center shadow-md flex-shrink-0">
            <ShieldIcon className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-semibold text-white truncate leading-tight">
              {user?.organization?.name || 'Airlock'}
            </h1>
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Governance</p>
          </div>
        </div>

        {/* Workspace switcher */}
        <WorkspaceSwitcher />

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter(item => isVisible(item.to, role))
            if (visibleItems.length === 0) return null
            return (
              <div key={group.label}>
                <div className="module-label">{group.label}</div>
                {visibleItems.map(item => (
                  <NavLink
                    key={item.to}
                    item={item}
                    active={isActive(item.to, (item as any).exact)}
                    onClick={() => setSidebarOpen(false)}
                  />
                ))}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 px-2 py-2" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          <Link
            to="/settings"
            className={`nav-item ${location.pathname === '/settings' ? 'active' : ''}`}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span>Settings</span>
          </Link>
          <button
            onClick={handleLogout}
            className="nav-item w-full text-left hover:!text-red-400"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header */}
        <header
          className="h-14 flex items-center justify-between px-4 lg:px-6 flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {/* Left: mobile menu + breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            {currentWorkspace && (
              <div className="hidden lg:flex items-center gap-1.5 text-sm">
                <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span className="font-medium text-slate-700">{currentWorkspace.name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 text-xs uppercase tracking-wide">{currentWorkspace.type}</span>
              </div>
            )}
          </div>

          {/* Right: user menu */}
          <div className="flex items-center gap-2">
            {/* Notification bell placeholder */}
            <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors relative">
              <Bell className="w-4 h-4" />
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold gradient-icon-bg"
                >
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-slate-700 leading-tight">{user?.name || 'User'}</p>
                  <p className="text-[10px] text-slate-400">{user?.role?.replace('_', ' ') || 'VIEWER'}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div
                    className="absolute right-0 mt-1 w-56 rounded-xl shadow-lg z-20 py-1 overflow-hidden"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                      <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
                      <span className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        {user?.role?.replace('_', ' ')}
                      </span>
                    </div>
                    <Link
                      to="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" style={{ padding: '24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
