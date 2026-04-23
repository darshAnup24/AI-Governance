import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import IncidentsPage from './pages/IncidentsPage'
import PoliciesPage from './pages/PoliciesPage'
import ShadowAIPage from './pages/ShadowAIPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'

// ─── ShieldAI Governance Pages ───────────────────────────
import Login from './pages/Login'
import GovDashboard from './pages/governance/Dashboard'
import Models from './pages/governance/Models'
import ThreatDetection from './pages/governance/ThreatDetection'
import Compliance from './pages/governance/Compliance'
import Advisor from './pages/governance/Advisor'
import GovIncidents from './pages/governance/Incidents'
import GovPolicies from './pages/governance/Policies'
import Vendors from './pages/governance/Vendors'
import GovReports from './pages/governance/Reports'

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/shield-login" element={<Login />} />
                    <Route
                        element={
                            <ProtectedRoute>
                                <AppLayout />
                            </ProtectedRoute>
                        }
                    >
                        {/* Existing proxy monitoring routes */}
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/incidents" element={<IncidentsPage />} />
                        <Route path="/policies" element={<PoliciesPage />} />
                        <Route path="/shadow-ai" element={<ShadowAIPage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />

                        {/* ShieldAI Governance routes */}
                        <Route path="/governance" element={<GovDashboard />} />
                        <Route path="/governance/models" element={<Models />} />
                        <Route path="/governance/threats" element={<ThreatDetection />} />
                        <Route path="/governance/compliance" element={<Compliance />} />
                        <Route path="/governance/advisor" element={<Advisor />} />
                        <Route path="/governance/incidents" element={<GovIncidents />} />
                        <Route path="/governance/policies" element={<GovPolicies />} />
                        <Route path="/governance/vendors" element={<Vendors />} />
                        <Route path="/governance/reports" element={<GovReports />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/governance" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}
