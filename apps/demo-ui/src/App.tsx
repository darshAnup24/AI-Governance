import { Routes, Route, Navigate } from 'react-router-dom'
import { LabProtectedRoute } from './components/LabProtectedRoute'
import LabLayout from './layouts/LabLayout'
import LabLoginPage from './pages/LabLoginPage'
import PromptInspector from './pages/lab/PromptInspector'
import PolicyEnforcement from './pages/lab/PolicyEnforcement'
import ChatGateway from './pages/lab/ChatGateway'
import AuditIncidents from './pages/lab/AuditIncidents'
import ShadowAISim from './pages/lab/ShadowAISim'

export default function App() {
  return (
    <Routes>
      <Route path="/lab-login" element={<LabLoginPage />} />
      <Route element={<LabProtectedRoute />}>
        <Route element={<LabLayout />}>
          <Route path="/lab" element={<PromptInspector />} />
          <Route path="/lab/prompt-inspector" element={<PromptInspector />} />
          <Route path="/lab/policy-enforcement" element={<PolicyEnforcement />} />
          <Route path="/lab/chat-gateway" element={<ChatGateway />} />
          <Route path="/lab/audit-incidents" element={<AuditIncidents />} />
          <Route path="/lab/shadow-ai-sim" element={<ShadowAISim />} />
          <Route path="*" element={<Navigate to="/lab" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
