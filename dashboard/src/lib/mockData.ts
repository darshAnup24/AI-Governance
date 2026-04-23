// ─────────────────────────────────────────────
//  CENTRALIZED MOCK DATA
//  When real APIs are up, remove these and let
//  the query hooks call the actual endpoints.
// ─────────────────────────────────────────────

export const mockAuditEvents = Array.from({ length: 50 }, (_, i) => ({
  id: `evt-${i + 1}`,
  userId: `user-${(i % 8) + 1}`,
  userName: ['alice', 'bob', 'charlie', 'diana', 'evan', 'fiona', 'grace', 'henry'][i % 8],
  orgId: 'org-1',
  action: (['ALLOW', 'LOG', 'WARN', 'REDACT', 'BLOCK'] as const)[i % 5],
  riskScore: Math.round(10 + Math.random() * 85),
  euAiActTier: (['MINIMAL', 'LIMITED', 'HIGH', 'UNACCEPTABLE'] as const)[i % 4],
  detectedCategories: [
    ['PII', 'API_KEY'],
    ['PROMPT_INJECTION'],
    ['REGULATORY'],
    ['HALLUCINATION', 'BIAS'],
    [],
  ][i % 5],
  promptPreview: 'My email is john@acme.com — help me write a script...',
  createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
}))

export const mockAnalyticsTrend = Array.from({ length: 30 }, (_, i) => {
  const base = 30 + Math.floor(Math.random() * 20)
  return {
    date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().split('T')[0],
    ALLOW: base + Math.floor(Math.random() * 40),
    LOG: Math.floor(Math.random() * 20),
    WARN: Math.floor(Math.random() * 12),
    REDACT: Math.floor(Math.random() * 8),
    BLOCK: Math.floor(Math.random() * 5),
  }
})

export const mockDetectionBreakdown = [
  { name: 'PII', value: 32, color: '#3b82f6' },
  { name: 'Prompt Injection', value: 25, color: '#ef4444' },
  { name: 'API Key', value: 18, color: '#f97316' },
  { name: 'Regulatory', value: 12, color: '#eab308' },
  { name: 'Hallucination', value: 8, color: '#a855f7' },
  { name: 'Bias', value: 5, color: '#22c55e' },
]

export const mockPolicies = [
  { id: 'p-1', name: 'Block Credential Leakage', orgId: 'org-1', conditions: [{ field: 'category', operator: 'equals', value: 'API_KEY' }], logic: 'AND', action: 'BLOCK', priority: 1, enabled: true, createdAt: '2024-01-10' },
  { id: 'p-2', name: 'Warn on PII', orgId: 'org-1', conditions: [{ field: 'riskScore', operator: 'gte', value: '60' }, { field: 'category', operator: 'equals', value: 'PII' }], logic: 'AND', action: 'WARN', priority: 2, enabled: true, createdAt: '2024-01-15' },
  { id: 'p-3', name: 'Redact Regulatory Data', orgId: 'org-1', conditions: [{ field: 'category', operator: 'equals', value: 'REGULATORY' }], logic: 'OR', action: 'REDACT', priority: 3, enabled: true, createdAt: '2024-02-01' },
  { id: 'p-4', name: 'Block Prompt Injection', orgId: 'org-1', conditions: [{ field: 'category', operator: 'equals', value: 'PROMPT_INJECTION' }], logic: 'OR', action: 'BLOCK', priority: 4, enabled: false, createdAt: '2024-02-15' },
]

export const mockUsers = [
  { id: 'u-1', email: 'alice@acme.com', name: 'Alice Chen', role: 'admin', department: 'Engineering', riskScore: 22 },
  { id: 'u-2', email: 'bob@acme.com', name: 'Bob Smith', role: 'analyst', department: 'Data Science', riskScore: 55 },
  { id: 'u-3', email: 'charlie@acme.com', name: 'Charlie Ray', role: 'user', department: 'Sales', riskScore: 78 },
  { id: 'u-4', email: 'diana@acme.com', name: 'Diana Lee', role: 'user', department: 'HR', riskScore: 91 },
  { id: 'u-5', email: 'evan@acme.com', name: 'Evan Park', role: 'user', department: 'Legal', riskScore: 34 },
  { id: 'u-6', email: 'fiona@acme.com', name: 'Fiona Bell', role: 'analyst', department: 'Finance', riskScore: 62 },
  { id: 'u-7', email: 'grace@acme.com', name: 'Grace Kim', role: 'user', department: 'Marketing', riskScore: 46 },
  { id: 'u-8', email: 'henry@acme.com', name: 'Henry Wu', role: 'user', department: 'Engineering', riskScore: 14 },
]

// User risk heatmap: [user][dayOfWeek] = risk score 0-100
export const mockUserHeatmap = mockUsers.map(u => ({
  user: u.name,
  days: Array.from({ length: 7 }, () => Math.max(0, Math.min(100, u.riskScore + Math.round((Math.random() - 0.5) * 40)))),
}))

export const mockShadowAIAlerts = [
  { id: 's-1', userId: 'u-3', userName: 'Charlie Ray', toolName: 'ChatGPT', domain: 'chat.openai.com', category: 'LLM', authorized: false, detectedAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 's-2', userId: 'u-4', userName: 'Diana Lee', toolName: 'Copilot', domain: 'copilot.microsoft.com', category: 'LLM', authorized: false, detectedAt: new Date(Date.now() - 7200000).toISOString() },
  { id: 's-3', userId: 'u-2', userName: 'Bob Smith', toolName: 'Gemini', domain: 'gemini.google.com', category: 'LLM', authorized: true, detectedAt: new Date(Date.now() - 10800000).toISOString() },
]

export const mockDashboardStats = {
  totalRequests: 14823,
  blockedToday: 47,
  redactedToday: 123,
  avgRiskScore: 38,
  complianceScore: 74,
  policiesActive: 3,
  shadowAIAlerts: 6,
  activeIncidents: 2,
}
