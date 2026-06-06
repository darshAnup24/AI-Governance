import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Users,
  Wifi,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { SidebarNav } from '../components/ui/sidebar-nav'
import type { NavItem, NavSection } from '../components/ui/sidebar-nav'
import { useRuntimeMode } from '../lib/hooks'

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/shadow-ai', label: 'Runtime Monitor', icon: Wifi },
  { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/reports', label: 'Audit Logs', icon: BarChart3 },
  { to: '/policies', label: 'Policies', icon: Shield },
  { to: '/governance/compliance', label: 'Compliance', icon: CheckCircle },
  { to: '/governance', label: 'AI Inventory', icon: Boxes },
  { to: '/governance/models', label: 'Models', icon: Boxes },
  { to: '/governance/vendors', label: 'Vendor Risk', icon: Users },
  { to: '/governance/heatmap', label: 'Use Cases', icon: Activity },
  { to: '/governance/threats', label: 'Assessments', icon: AlertTriangle },
  { to: '/governance/advisor', label: 'AI Advisor', icon: Bot },
  { to: '/governance/incidents', label: 'Governance Incidents', icon: AlertTriangle },
  { to: '/governance/policies', label: 'Policy Builder', icon: Shield },
  { to: '/governance/reports', label: 'Governance Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const titles: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  '/dashboard': {
    eyebrow: 'Proxy Monitor',
    title: 'Operational oversight for live AI traffic',
    subtitle: 'Track stream health, latency, enforcement actions, and incident signals in one place.',
  },
  '/governance': {
    eyebrow: 'Governance Overview',
    title: 'A single command surface for policy, risk, and compliance',
    subtitle: 'Review portfolio health, surface drift, and move quickly on governance signals.',
  },
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, switchWorkspace, switchEnvironment } = useAuth()
  const runtimeModeQ = useRuntimeMode()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const activeMeta = useMemo(() => {
    const match = Object.entries(titles).find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`))
    if (match) return match[1]
    return {
      eyebrow: 'Airlock Workspace',
      title: 'Focused controls for every part of your AI estate',
      subtitle: 'Use the navigation to move between live monitoring, governance, and supporting workflows.',
    }
  }, [location.pathname])

  const initials = useMemo(() => (user?.email ?? 'A').slice(0, 1).toUpperCase(), [user?.email])

  const canView = (permission: string) => user?.permissions.includes(permission) ?? false

  const unifiedNavItems = navItems
    .filter((item) => {
      if (item.to === '/reports') return canView('can_export_reports') || canView('can_view_dashboard')
      if (item.to === '/settings') return canView('can_manage_organization') || canView('can_manage_sso')
      return true
    })
    .filter((item) => {
      if (item.to.includes('/compliance')) return canView('can_view_compliance')
      if (item.to.includes('/policies')) return canView('can_manage_policies')
      if (item.to.includes('/vendors')) return canView('can_manage_providers')
      if (item.to.includes('/reports')) return canView('can_export_reports')
      return true
    })

  const navSections: NavSection[] = useMemo(() => {
    const sectionMap: Array<{ title: string; paths: string[] }> = [
      { title: 'Monitoring', paths: ['/dashboard', '/shadow-ai', '/incidents', '/reports'] },
      { title: 'Governance', paths: ['/policies', '/governance', '/governance/compliance', '/governance/models', '/governance/policies', '/governance/advisor'] },
      { title: 'Risk', paths: ['/governance/vendors', '/governance/heatmap', '/governance/threats', '/governance/incidents'] },
      { title: 'Admin', paths: ['/governance/reports', '/settings'] },
    ]

    return sectionMap
      .map((section) => ({
        title: section.title,
        items: section.paths
          .map((path) => unifiedNavItems.find((item) => item.to === path))
          .filter(Boolean) as NavItem[],
      }))
      .filter((section) => section.items.length > 0)
  }, [unifiedNavItems])

  const runtimeMode = runtimeModeQ.data?.mode || 'STANDARD'
  const degradedEvents = runtimeModeQ.data?.degraded_events || 0

  const runtimeTone =
    runtimeMode === 'STRICT'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
      : runtimeMode === 'HYBRID'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-[var(--sidebar-background)] text-[var(--sidebar-foreground)] transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)]">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-[var(--foreground)]">Airlock</p>
              <p className="truncate text-xs text-[var(--muted-foreground)]">AI Governance Platform</p>
            </div>
          </div>
        </div>

        <div className="border-b px-4 py-4">
          <div className="rounded-lg border bg-[var(--background)] p-3 shadow-sm">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {user?.organization?.name || user?.department || 'Governance workspace'}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              {user?.activeWorkspace ? `${user.activeWorkspace.name} is active.` : 'Switch between live monitoring and governance workflows.'}
            </p>
            <div className={`mt-3 rounded-md border px-2.5 py-2 text-xs ${runtimeTone}`}>
              Runtime {runtimeMode} · {degradedEvents} degraded events
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={navSections} title="Platform" />
        </nav>

        <div className="border-t p-3">
          <Link
            to="/live-demo/detection"
            className="flex items-center gap-3 rounded-lg border bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--sidebar-accent)]"
          >
            <Activity className="h-4 w-4" />
            <span>Open demo lab</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-[var(--background)]">
          <div className="flex h-12 items-center gap-3 px-4 md:px-6">
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-[var(--background)] text-[var(--muted-foreground)] md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--muted-foreground)]">{activeMeta.eyebrow}</p>
              <h1 className="truncate text-base font-medium text-[var(--foreground)]">{activeMeta.title}</h1>
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              {user?.workspaces?.length ? (
                <select
                  className="h-9 rounded-md border bg-[var(--background)] px-3 text-sm"
                  value={user.activeWorkspace?.id || ''}
                  onChange={(event) => void switchWorkspace(event.target.value)}
                >
                  {user.workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {user?.activeWorkspace?.environments?.length ? (
                <select
                  className="h-9 rounded-md border bg-[var(--background)] px-3 text-sm"
                  value={user.activeEnvironment?.id || ''}
                  onChange={(event) => void switchEnvironment(event.target.value)}
                >
                  {user.activeWorkspace.environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((current) => !current)}
                className="flex items-center gap-3 rounded-lg border bg-[var(--background)] px-2.5 py-1.5 text-left shadow-sm"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--primary)] text-xs font-semibold text-[var(--primary-foreground)]">
                  {initials}
                </div>
                <div className="hidden sm:block">
                  <p className="max-w-[180px] truncate text-sm font-medium text-[var(--foreground)]">{user?.email || 'Admin'}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Administrator'}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-[var(--muted-foreground)]" />
              </button>

              {userMenuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border bg-[var(--popover)] p-2 shadow-md">
                    <div className="rounded-md px-2 py-2">
                      <p className="text-sm font-medium text-[var(--popover-foreground)]">{user?.email || 'Admin user'}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {user?.activeWorkspace?.name || user?.organization?.name || 'Governance workspace'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      onClick={handleLogout}
                      icon={<LogOut className="h-4 w-4" />}
                    >
                      Sign out
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1">
          <div className="content-container px-4 py-6 md:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
