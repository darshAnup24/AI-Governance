import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import GovDashboard from './pages/governance/Dashboard'
import Models from './pages/governance/Models'
import Compliance from './pages/governance/Compliance'
import PolicyBuilder from './pages/governance/PolicyBuilder'
import UserHeatmap from './pages/governance/UserHeatmap'
import Advisor from './pages/governance/Advisor'
import GovIncidents from './pages/governance/Incidents'
import IncidentDetail from './pages/governance/IncidentDetail'
import Vendors from './pages/governance/Vendors'
import GovReports from './pages/governance/Reports'
import AuditLog from './pages/governance/AuditLog'
import PolicyTemplates from './pages/governance/PolicyTemplates'
import Usage from './pages/governance/Usage'
import Settings from './pages/Settings'
import ProxyMonitor from './pages/proxy/ProxyMonitor'
import ShadowAI from './pages/proxy/ShadowAI'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/governance" element={<GovDashboard />} />
          <Route path="/governance/models" element={<Models />} />
          <Route path="/governance/compliance" element={<Compliance />} />
          <Route path="/governance/policies" element={<PolicyBuilder />} />
          <Route path="/governance/heatmap" element={<UserHeatmap />} />
          <Route path="/governance/advisor" element={<Advisor />} />
          <Route path="/governance/incidents" element={<GovIncidents />} />
          <Route path="/governance/incidents/:id" element={<IncidentDetail />} />
          <Route path="/governance/vendors" element={<Vendors />} />
          <Route path="/governance/reports" element={<GovReports />} />
          <Route path="/governance/audit-log" element={<AuditLog />} />
          <Route path="/governance/policy-templates" element={<PolicyTemplates />} />
          <Route path="/governance/usage" element={<Usage />} />
          <Route path="/governance/proxy-monitor" element={<ProxyMonitor />} />
          <Route path="/governance/shadow-ai" element={<ShadowAI />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/governance" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
