import { useState } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Zap, Shield, Activity, AlertTriangle, Wifi, Menu,
  LogOut, ChevronDown, FlaskConical, Bug, Terminal,
} from 'lucide-react'
import { SidebarNav } from '@airlock/shared-ui'
import type { NavItem } from '@airlock/shared-ui'
import { useLabAuth } from '../contexts/LabAuthContext'

const labNavItems: NavItem[] = [
  { to: '/lab/prompt-inspector', label: 'Prompt Inspector', icon: Zap },
  { to: '/lab/policy-enforcement', label: 'Policy Enforcement', icon: Shield },
  { to: '/lab/chat-gateway', label: 'Chat Gateway', icon: Activity },
  { to: '/lab/audit-incidents', label: 'Audit & Incidents', icon: AlertTriangle },
  { to: '/lab/shadow-ai-sim', label: 'Shadow AI Sim', icon: Wifi },
]

export default function LabLayout() {
  const { user, logout, isDemoMode } = useLabAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/lab-login')
  }

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <motion.aside
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[var(--foreground)] text-white border-r border-slate-800/60
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
        `}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-800/60">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-[0_2px_8px_rgba(16,185,129,0.2)]">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white">Airlock</h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 uppercase tracking-wider border border-emerald-500/30">Lab</span>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Demo & Sandbox</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400 font-semibold">Sandbox Mode</p>
            <p className="text-[10px] text-amber-500/70 mt-0.5">No production data</p>
          </div>
          <SidebarNav items={labNavItems} title="Lab" />
        </nav>

        <div className="px-3 py-3 border-t border-slate-800/60">
          <Link
            to="/lab"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/40 transition-colors"
          >
            <Bug className="w-4 h-4" />
            Diagnostics
          </Link>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[var(--border)] flex items-center justify-between px-4 lg:px-6 bg-white/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded-lg transition-colors" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/5 text-emerald-600 text-xs font-medium border border-emerald-500/20">
              <Terminal className="w-3 h-3" />
              LAB ENVIRONMENT
            </span>
          </div>

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <span className="text-xs font-medium text-emerald-600">
                  {user?.name?.charAt(0)?.toUpperCase() || 'D'}
                </span>
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-[var(--foreground)]">{user?.name || 'Demo User'}</p>
                <p className="text-xs text-[var(--muted-foreground)]">Lab Access</p>
              </div>
              <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white border border-[var(--border)] rounded-xl shadow-lg z-20 py-2">
                  <div className="px-4 py-2 border-b border-[var(--border)]">
                    <p className="text-sm font-medium text-[var(--foreground)]">{user?.name || 'Demo User'}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{user?.email || 'demo@airlock.io'}</p>
                    <p className="text-xs text-emerald-600 mt-1">Lab Environment</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-[var(--muted)] transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
