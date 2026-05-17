import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { ErrorBoundary } from './components/ErrorBoundary'
import InstallPWA from './components/InstallPWA'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import IncidentsPage from './pages/IncidentsPage'
import PoliciesPage from './pages/PoliciesPage'
import ShadowAIPage from './pages/ShadowAIPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import DemoLayout from './pages/demo/DemoLayout'
import DetectionDemo from './pages/demo/DetectionDemo'
import PolicyDemo from './pages/demo/PolicyDemo'
import ChatDemo from './pages/demo/ChatDemo'
import AuditDemo from './pages/demo/AuditDemo'
import ShadowAIDemo from './pages/demo/ShadowAIDemo'
// ─── ShieldAI Governance Pages ────────────────────────────────────────────────
import Login from './pages/Login'
import GovDashboard from './pages/governance/Dashboard'
import Models from './pages/governance/Models'
import Compliance from './pages/governance/Compliance'
import Advisor from './pages/governance/Advisor'
import GovIncidents from './pages/governance/Incidents'
import GovPolicies from './pages/governance/Policies'
import Vendors from './pages/governance/Vendors'
import GovReports from './pages/governance/Reports'
import UserHeatmap from './pages/governance/UserHeatmap'

function Wrap({ children }: { children: React.ReactNode }) {
    return <ErrorBoundary>{children}</ErrorBoundary>
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <InstallPWA />
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
                        <Route path="/dashboard" element={<Wrap><DashboardPage /></Wrap>} />
                        <Route path="/incidents" element={<Wrap><IncidentsPage /></Wrap>} />
                        <Route path="/policies" element={<Wrap><PoliciesPage /></Wrap>} />
                        <Route path="/shadow-ai" element={<Wrap><ShadowAIPage /></Wrap>} />
                        <Route path="/live-demo" element={<Wrap><DemoLayout /></Wrap>}>
                            <Route path="detection" element={<DetectionDemo />} />
                            <Route path="policy" element={<PolicyDemo />} />
                            <Route path="chat" element={<ChatDemo />} />
                            <Route path="audit" element={<AuditDemo />} />
                            <Route path="shadow-ai" element={<ShadowAIDemo />} />
                        </Route>
                        <Route path="/reports" element={<Wrap><ReportsPage /></Wrap>} />
                        <Route path="/settings" element={<Wrap><SettingsPage /></Wrap>} />

                        {/* ShieldAI Governance routes */}
                        <Route path="/governance" element={<Wrap><GovDashboard /></Wrap>} />
                        <Route path="/governance/models" element={<Wrap><Models /></Wrap>} />
                        <Route path="/governance/compliance" element={<Wrap><Compliance /></Wrap>} />
                        <Route path="/governance/advisor" element={<Wrap><Advisor /></Wrap>} />
                        <Route path="/governance/incidents" element={<Wrap><GovIncidents /></Wrap>} />
                        <Route path="/governance/policies" element={<Wrap><GovPolicies /></Wrap>} />
                        <Route path="/governance/vendors" element={<Wrap><Vendors /></Wrap>} />
                        <Route path="/governance/reports" element={<Wrap><GovReports /></Wrap>} />
                        <Route path="/governance/heatmap" element={<Wrap><UserHeatmap /></Wrap>} />
                    </Route>
                    <Route path="*" element={<Navigate to="/governance" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}
