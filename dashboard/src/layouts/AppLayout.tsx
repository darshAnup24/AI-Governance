import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
<<<<<<< HEAD
=======
import { useTheme } from '../contexts/ThemeContext'
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
import {
    LayoutDashboard,
    Shield,
    AlertTriangle,
<<<<<<< HEAD
    FileText,
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
    Wifi,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronDown,
    Bot,
    Zap,
    CheckCircle2,
<<<<<<< HEAD
    MessageSquare,
    Users,
    BarChart3,
    Boxes,
} from 'lucide-react'

const proxyNavItems = [
    { to: '/dashboard', label: 'Proxy Monitor', icon: LayoutDashboard },
    { to: '/shadow-ai', label: 'Shadow AI', icon: Wifi },
]

=======
    Users,
    BarChart3,
    Boxes,
    Sun,
    Moon,
    Activity,
} from 'lucide-react'

>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
const govNavItems = [
    { to: '/governance', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/governance/models', label: 'AI Models', icon: Boxes },
    { to: '/governance/threats', label: 'Threats', icon: Zap },
    { to: '/governance/compliance', label: 'Compliance', icon: CheckCircle2 },
<<<<<<< HEAD
    { to: '/governance/advisor', label: 'AI Advisor', icon: Bot },
    { to: '/governance/incidents', label: 'Incidents', icon: AlertTriangle },
    { to: '/governance/policies', label: 'Policies', icon: Shield },
=======
    { to: '/governance/policies', label: 'Policy Builder', icon: Shield },
    { to: '/governance/heatmap', label: 'User Heatmap', icon: Activity },
    { to: '/governance/advisor', label: 'AI Advisor', icon: Bot },
    { to: '/governance/incidents', label: 'Incidents', icon: AlertTriangle },
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
    { to: '/governance/vendors', label: 'Vendors', icon: Users },
    { to: '/governance/reports', label: 'Reports', icon: BarChart3 },
    { to: '/settings', label: 'Settings', icon: Settings },
]

<<<<<<< HEAD

export default function AppLayout() {
    const { user, logout } = useAuth()
=======
const proxyNavItems = [
    { to: '/dashboard', label: 'Proxy Monitor', icon: LayoutDashboard },
    { to: '/shadow-ai', label: 'Shadow AI', icon: Wifi },
]

export default function AppLayout() {
    const { user, logout } = useAuth()
    const { theme, toggle: toggleTheme } = useTheme()
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
    const navigate = useNavigate()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [userMenuOpen, setUserMenuOpen] = useState(false)

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <div className="min-h-screen flex bg-slate-950">
<<<<<<< HEAD
            {/* Sidebar overlay on mobile */}
=======
            {/* Mobile sidebar overlay */}
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
<<<<<<< HEAD
                className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-slate-900/80 backdrop-blur-xl border-r border-slate-800 z-50 
        transition-transform duration-300 lg:translate-x-0 flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Logo */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
                    <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-cyan-500 rounded-lg flex items-center justify-center">
=======
                className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-slate-900/80 backdrop-blur-xl 
                border-r border-slate-800 z-50 transition-transform duration-300 lg:translate-x-0 flex flex-col
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Logo */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
                    <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-brand-500/20">
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                        <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-100">ShieldAI</h1>
                        <p className="text-xs text-slate-500">Governance v1.0</p>
                    </div>
                    <button className="ml-auto lg:hidden text-slate-400" onClick={() => setSidebarOpen(false)}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
<<<<<<< HEAD
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Governance</p>
=======
                <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                    <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
                        Governance
                    </p>
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                    {govNavItems.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/governance'}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
<<<<<<< HEAD
                                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isActive
                                    ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`
                            }
                        >
                            <Icon className="w-4 h-4" />
=======
                                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                                ${isActive
                                    ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`
                            }
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                            <span>{label}</span>
                        </NavLink>
                    ))}

<<<<<<< HEAD
                    <p className="px-3 mt-4 mb-2 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Proxy</p>
=======
                    <p className="px-3 mt-5 mb-2 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
                        Proxy
                    </p>
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                    {proxyNavItems.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
<<<<<<< HEAD
                                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isActive
=======
                                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                                ${isActive
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                                    ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`
                            }
                        >
<<<<<<< HEAD
                            <Icon className="w-4 h-4" />
=======
                            <Icon className="w-4 h-4 flex-shrink-0" />
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>

<<<<<<< HEAD
                {/* User menu */}
                <div className="p-3 border-t border-slate-800">
=======
                {/* User menu + theme toggle */}
                <div className="p-3 border-t border-slate-800 space-y-1">
                    {/* Dark mode toggle */}
                    <button
                        id="theme-toggle-btn"
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
                    >
                        {theme === 'dark'
                            ? <Sun className="w-4 h-4 text-yellow-400" />
                            : <Moon className="w-4 h-4 text-blue-400" />}
                        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>

                    {/* User dropdown */}
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                    <div className="relative">
                        <button
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/50 transition-colors"
                        >
<<<<<<< HEAD
                            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                {user?.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-slate-200 truncate">{user?.email || 'User'}</p>
                                <p className="text-xs text-slate-500 capitalize">{user?.role || 'admin'}</p>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {userMenuOpen && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden animate-slide-up">
=======
                            <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                {user?.email?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className="text-xs font-medium text-slate-200 truncate">{user?.email || 'User'}</p>
                                <p className="text-[10px] text-slate-500 capitalize">{user?.role || 'admin'}</p>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${userMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {userMenuOpen && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-slate-700/50 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span>Sign out</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main content */}
<<<<<<< HEAD
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Top bar (mobile) */}
                <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-30">
=======
            <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
                {/* Mobile topbar */}
                <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-30">
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                    <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-slate-200">
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-brand-400" />
<<<<<<< HEAD
                        <span className="text-sm font-semibold">AI Governance</span>
                    </div>
                    <div className="w-6" />
                </header>

                {/* Page content */}
                <main className="flex-1 p-6 lg:p-8 overflow-auto">
=======
                        <span className="text-sm font-semibold text-slate-100">ShieldAI</span>
                    </div>
                    <button onClick={toggleTheme} className="text-slate-400 hover:text-slate-200">
                        {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-blue-400" />}
                    </button>
                </header>

                {/* Page content */}
                <main className="flex-1 p-4 lg:p-8 overflow-auto">
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
