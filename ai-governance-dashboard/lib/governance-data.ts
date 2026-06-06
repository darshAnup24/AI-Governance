export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info"
export type IncidentStatus = "open" | "reviewing" | "resolved" | "escalated"
export type PolicyStatus = "active" | "draft" | "deprecated" | "review"
export type PromptDecision = "blocked" | "allowed" | "redacted" | "flagged"
export type VendorStatus = "approved" | "pending" | "restricted" | "offboarded"
export type FrameworkHealth = "on-track" | "at-risk" | "behind" | "complete"
export type AdvisorTone = "critical" | "warning" | "info" | "success"

export interface Incident {
  id: string
  title: string
  severity: SeverityLevel
  status: IncidentStatus
  model: string
  policy: string
  timestamp: string
  reviewer: string | null
  description: string
  promptId: string
}

export interface Policy {
  id: string
  name: string
  status: PolicyStatus
  category: string
  enforcementCount: number
  violationRate: number
  lastUpdated: string
  owner: string
}

export interface AuditLog {
  id: string
  action: string
  actor: string
  resource: string
  timestamp: string
  decision: PromptDecision
  model: string
  latencyMs: number
  riskScore: number
}

export interface ModelEntry {
  id: string
  name: string
  vendor: string
  version: string
  status: "active" | "deprecated" | "staging"
  riskScore: number
  requestsToday: number
  blockedToday: number
  lastActive: string
}

export interface Vendor {
  id: string
  name: string
  status: VendorStatus
  models: number
  riskScore: number
  contract: string
  dpa: boolean
  soc2: boolean
  dataResidency: string
  lastReview: string
}

export interface Dataset {
  id: string
  name: string
  source: string
  rows: number
  classification: "public" | "internal" | "confidential" | "restricted"
  lineageSteps: number
  lastScan: string
  piiDetected: boolean
}

export interface Agent {
  id: string
  name: string
  purpose: string
  model: string
  status: "active" | "draft" | "paused"
  runs: number
  successRate: number
  owner: string
}

export interface ComplianceFramework {
  id: string
  name: string
  shortName: string
  controls: number
  controlsPassed: number
  owner: string
  health: FrameworkHealth
  dueDate: string
  domain: string
}

export interface RiskRollup {
  label: string
  critical: number
  high: number
  medium: number
  low: number
  trend: number
}

export interface AdvisorRecommendation {
  id: string
  title: string
  description: string
  tone: AdvisorTone
  category: string
  impact: string
  action: string
  cta: string
}

export interface AuditTimelineEvent {
  id: string
  type: "policy" | "incident" | "approval" | "enforcement" | "access"
  title: string
  actor: string
  resource: string
  timestamp: string
  meta?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI data
// ─────────────────────────────────────────────────────────────────────────────
export const kpiData = {
  activePolicies: { value: 47, delta: +3, label: "Active Policies" },
  runtimeIncidents: { value: 12, delta: +4, label: "Runtime Incidents", alert: true },
  blockedPrompts: { value: 1847, delta: -8, label: "Blocked Prompts (24h)" },
  avgRiskScore: { value: 34, delta: -2, label: "Avg Risk Score" },
  activeModels: { value: 23, delta: 0, label: "Active Models" },
  complianceHealth: { value: 94, delta: +1, label: "Compliance Health %" },
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk trend chart data (last 30 days)
// ─────────────────────────────────────────────────────────────────────────────
export const riskTrendData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (29 - i))
  return {
    date: date.toISOString().slice(0, 10),
    riskScore: Math.round(28 + Math.random() * 20 + (i < 10 ? 8 : 0)),
    incidents: Math.round(Math.random() * 6 + (i > 20 ? 2 : 0)),
    blocked: Math.round(50 + Math.random() * 120),
    allowed: Math.round(800 + Math.random() * 400),
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Incidents
// ─────────────────────────────────────────────────────────────────────────────
export const incidents: Incident[] = [
  { id: "INC-2401", title: "PII exfiltration attempt via prompt injection", severity: "critical", status: "open", model: "GPT-4o", policy: "PII Data Protection", timestamp: "2026-06-06T14:32:00Z", reviewer: null, description: "Detected structured attempt to extract user PII through adversarial prompt chaining.", promptId: "PRO-8812" },
  { id: "INC-2400", title: "Jailbreak pattern detected in code assistant", severity: "high", status: "reviewing", model: "Claude 3.5 Sonnet", policy: "Jailbreak Prevention", timestamp: "2026-06-06T13:18:00Z", reviewer: "Sarah Chen", description: "User attempted DAN-style jailbreak to bypass content restrictions.", promptId: "PRO-8798" },
  { id: "INC-2399", title: "GDPR-regulated data included in request", severity: "high", status: "reviewing", model: "Gemini 1.5 Pro", policy: "GDPR Compliance", timestamp: "2026-06-06T12:05:00Z", reviewer: "Raj Patel", description: "Request body contained EU citizen data without consent markers.", promptId: "PRO-8781" },
  { id: "INC-2398", title: "Model hallucination flagged in financial output", severity: "medium", status: "resolved", model: "GPT-4o", policy: "Financial Accuracy", timestamp: "2026-06-06T10:44:00Z", reviewer: "Maria Torres", description: "Output contained fabricated regulatory citation in financial summary.", promptId: "PRO-8770" },
  { id: "INC-2397", title: "Repeated high-frequency probing from single API key", severity: "medium", status: "resolved", model: "Claude 3.5 Sonnet", policy: "Rate Limit Abuse", timestamp: "2026-06-06T09:20:00Z", reviewer: "James Wu", description: "API key exceeded probe threshold; potential automated adversarial scanning.", promptId: "PRO-8762" },
  { id: "INC-2396", title: "Unauthorized vendor model access attempt", severity: "high", status: "escalated", model: "Mistral Large", policy: "Vendor Authorization", timestamp: "2026-06-06T08:01:00Z", reviewer: "Sarah Chen", description: "Request routed to uncertified Mistral endpoint outside approved vendor list.", promptId: "PRO-8750" },
  { id: "INC-2395", title: "Prompt contained internal system credentials", severity: "critical", status: "resolved", model: "GPT-4o", policy: "Secrets Detection", timestamp: "2026-06-05T22:14:00Z", reviewer: "James Wu", description: "Regex engine detected AWS access key pattern in prompt payload.", promptId: "PRO-8741" },
  { id: "INC-2394", title: "Bias flagged in HR recommendation output", severity: "medium", status: "open", model: "Llama 3.1 70B", policy: "AI Fairness & Bias", timestamp: "2026-06-05T19:30:00Z", reviewer: null, description: "Fairness classifier scored output 0.73 on gender-bias axis (threshold: 0.65).", promptId: "PRO-8735" },
  { id: "INC-2393", title: "Confidential contract data in prompt body", severity: "high", status: "resolved", model: "Claude 3.5 Sonnet", policy: "Data Classification", timestamp: "2026-06-05T16:22:00Z", reviewer: "Raj Patel", description: "DLP engine matched 3 confidential contract clause patterns in request.", promptId: "PRO-8724" },
  { id: "INC-2392", title: "Low severity prompt toxicity in customer app", severity: "low", status: "resolved", model: "GPT-3.5 Turbo", policy: "Content Safety", timestamp: "2026-06-05T14:11:00Z", reviewer: "Maria Torres", description: "Toxicity classifier returned 0.61 confidence; below block threshold but flagged.", promptId: "PRO-8716" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────
export const auditLogs: AuditLog[] = [
  { id: "AUD-10041", action: "Prompt Blocked", actor: "api-key-prod-7f2a", resource: "GPT-4o /v1/chat", timestamp: "2026-06-06T14:32:11Z", decision: "blocked", model: "GPT-4o", latencyMs: 38, riskScore: 92 },
  { id: "AUD-10040", action: "Prompt Allowed", actor: "app-customer-portal", resource: "Claude /messages", timestamp: "2026-06-06T14:31:47Z", decision: "allowed", model: "Claude 3.5 Sonnet", latencyMs: 24, riskScore: 12 },
  { id: "AUD-10039", action: "PII Redacted", actor: "api-key-internal-3c1b", resource: "GPT-4o /v1/chat", timestamp: "2026-06-06T14:30:58Z", decision: "redacted", model: "GPT-4o", latencyMs: 55, riskScore: 67 },
  { id: "AUD-10038", action: "Prompt Flagged", actor: "sdk-webapp-9d4e", resource: "Gemini /generate", timestamp: "2026-06-06T14:29:33Z", decision: "flagged", model: "Gemini 1.5 Pro", latencyMs: 41, riskScore: 58 },
  { id: "AUD-10037", action: "Prompt Allowed", actor: "app-internal-tools", resource: "Claude /messages", timestamp: "2026-06-06T14:28:10Z", decision: "allowed", model: "Claude 3.5 Sonnet", latencyMs: 19, riskScore: 8 },
  { id: "AUD-10036", action: "Prompt Blocked", actor: "api-key-external-1a9c", resource: "GPT-4o /v1/chat", timestamp: "2026-06-06T14:27:02Z", decision: "blocked", model: "GPT-4o", latencyMs: 32, riskScore: 88 },
  { id: "AUD-10035", action: "Prompt Allowed", actor: "app-customer-portal", resource: "Llama /completions", timestamp: "2026-06-06T14:26:45Z", decision: "allowed", model: "Llama 3.1 70B", latencyMs: 77, riskScore: 21 },
  { id: "AUD-10034", action: "PII Redacted", actor: "sdk-mobile-7b2f", resource: "GPT-4o /v1/chat", timestamp: "2026-06-06T14:25:31Z", decision: "redacted", model: "GPT-4o", latencyMs: 48, riskScore: 71 },
  { id: "AUD-10033", action: "Prompt Blocked", actor: "api-key-staging-2e8a", resource: "Mistral /chat", timestamp: "2026-06-06T14:24:14Z", decision: "blocked", model: "Mistral Large", latencyMs: 29, riskScore: 95 },
  { id: "AUD-10032", action: "Prompt Allowed", actor: "app-internal-tools", resource: "GPT-4o /v1/chat", timestamp: "2026-06-06T14:23:08Z", decision: "allowed", model: "GPT-4o", latencyMs: 22, riskScore: 15 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Policies
// ─────────────────────────────────────────────────────────────────────────────
export const policies: Policy[] = [
  { id: "POL-001", name: "PII Data Protection", status: "active", category: "Data Privacy", enforcementCount: 8420, violationRate: 2.3, lastUpdated: "2026-05-28", owner: "Privacy Team" },
  { id: "POL-002", name: "Jailbreak Prevention", status: "active", category: "Safety", enforcementCount: 14830, violationRate: 0.8, lastUpdated: "2026-06-01", owner: "Security Team" },
  { id: "POL-003", name: "GDPR Compliance", status: "active", category: "Regulatory", enforcementCount: 6210, violationRate: 1.4, lastUpdated: "2026-05-15", owner: "Legal Team" },
  { id: "POL-004", name: "Secrets Detection", status: "active", category: "Security", enforcementCount: 3890, violationRate: 0.5, lastUpdated: "2026-06-03", owner: "Security Team" },
  { id: "POL-005", name: "Content Safety", status: "active", category: "Safety", enforcementCount: 22100, violationRate: 3.1, lastUpdated: "2026-05-22", owner: "Trust & Safety" },
  { id: "POL-006", name: "Financial Accuracy", status: "active", category: "Domain", enforcementCount: 2760, violationRate: 1.9, lastUpdated: "2026-05-30", owner: "Risk Team" },
  { id: "POL-007", name: "AI Fairness & Bias", status: "review", category: "Ethics", enforcementCount: 1840, violationRate: 4.2, lastUpdated: "2026-06-05", owner: "AI Ethics Board" },
  { id: "POL-008", name: "Vendor Authorization", status: "active", category: "Access Control", enforcementCount: 990, violationRate: 0.3, lastUpdated: "2026-05-10", owner: "Ops Team" },
  { id: "POL-009", name: "Rate Limit Abuse", status: "active", category: "Security", enforcementCount: 5500, violationRate: 1.1, lastUpdated: "2026-06-04", owner: "Security Team" },
  { id: "POL-010", name: "Legacy Model Block", status: "deprecated", category: "Access Control", enforcementCount: 320, violationRate: 0.0, lastUpdated: "2026-04-01", owner: "Ops Team" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Model registry
// ─────────────────────────────────────────────────────────────────────────────
export const models: ModelEntry[] = [
  { id: "MDL-001", name: "GPT-4o", vendor: "OpenAI", version: "2024-11-20", status: "active", riskScore: 28, requestsToday: 48210, blockedToday: 312, lastActive: "2 min ago" },
  { id: "MDL-002", name: "Claude 3.5 Sonnet", vendor: "Anthropic", version: "20241022", status: "active", riskScore: 19, requestsToday: 32100, blockedToday: 198, lastActive: "1 min ago" },
  { id: "MDL-003", name: "Gemini 1.5 Pro", vendor: "Google", version: "001", status: "active", riskScore: 24, requestsToday: 18450, blockedToday: 141, lastActive: "5 min ago" },
  { id: "MDL-004", name: "Llama 3.1 70B", vendor: "Meta", version: "3.1-70b", status: "active", riskScore: 33, requestsToday: 9870, blockedToday: 87, lastActive: "12 min ago" },
  { id: "MDL-005", name: "Mistral Large", vendor: "Mistral AI", version: "2407", status: "staging", riskScore: 41, requestsToday: 2140, blockedToday: 23, lastActive: "1 hour ago" },
  { id: "MDL-006", name: "GPT-3.5 Turbo", vendor: "OpenAI", version: "0125", status: "deprecated", riskScore: 15, requestsToday: 1200, blockedToday: 8, lastActive: "3 hours ago" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Vendors
// ─────────────────────────────────────────────────────────────────────────────
export const vendors: Vendor[] = [
  { id: "VND-001", name: "OpenAI", status: "approved", models: 2, riskScore: 28, contract: "2026-12-31", dpa: true, soc2: true, dataResidency: "US", lastReview: "2026-04-12" },
  { id: "VND-002", name: "Anthropic", status: "approved", models: 1, riskScore: 19, contract: "2027-02-28", dpa: true, soc2: true, dataResidency: "US", lastReview: "2026-05-03" },
  { id: "VND-003", name: "Google", status: "approved", models: 1, riskScore: 24, contract: "2026-09-15", dpa: true, soc2: true, dataResidency: "Multi", lastReview: "2026-03-22" },
  { id: "VND-004", name: "Meta", status: "approved", models: 1, riskScore: 33, contract: "2026-11-30", dpa: true, soc2: false, dataResidency: "US", lastReview: "2026-02-18" },
  { id: "VND-005", name: "Mistral AI", status: "pending", models: 1, riskScore: 41, contract: "Pilot", dpa: false, soc2: false, dataResidency: "EU", lastReview: "2026-05-30" },
  { id: "VND-006", name: "Cohere", status: "restricted", models: 0, riskScore: 58, contract: "Under Review", dpa: true, soc2: true, dataResidency: "US", lastReview: "2026-05-12" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Datasets
// ─────────────────────────────────────────────────────────────────────────────
export const datasets: Dataset[] = [
  { id: "DAT-001", name: "Customer Support Transcripts", source: "Snowflake", rows: 1284000, classification: "confidential", lineageSteps: 7, lastScan: "2026-06-05", piiDetected: true },
  { id: "DAT-002", name: "Product Knowledge Base", source: "Postgres", rows: 48120, classification: "internal", lineageSteps: 4, lastScan: "2026-06-04", piiDetected: false },
  { id: "DAT-003", name: "Marketing Copy Library", source: "S3", rows: 9420, classification: "public", lineageSteps: 2, lastScan: "2026-06-01", piiDetected: false },
  { id: "DAT-004", name: "Financial Reports (EU)", source: "BigQuery", rows: 18450, classification: "restricted", lineageSteps: 9, lastScan: "2026-06-06", piiDetected: true },
  { id: "DAT-005", name: "Engineering Runbooks", source: "Confluence", rows: 3280, classification: "internal", lineageSteps: 3, lastScan: "2026-05-29", piiDetected: false },
]

// ─────────────────────────────────────────────────────────────────────────────
// Agents
// ─────────────────────────────────────────────────────────────────────────────
export const agents: Agent[] = [
  { id: "AGT-001", name: "Triage Assistant", purpose: "Routes incoming support tickets", model: "Claude 3.5 Sonnet", status: "active", runs: 12480, successRate: 96.4, owner: "Support Ops" },
  { id: "AGT-002", name: "Code Reviewer", purpose: "Reviews pull requests for security", model: "GPT-4o", status: "active", runs: 4320, successRate: 92.1, owner: "Platform Eng" },
  { id: "AGT-003", name: "Sales Researcher", purpose: "Builds account briefs from public data", model: "Gemini 1.5 Pro", status: "active", runs: 2810, successRate: 89.7, owner: "Revenue Ops" },
  { id: "AGT-004", name: "Compliance Auditor", purpose: "Flags regulated content in documents", model: "Claude 3.5 Sonnet", status: "draft", runs: 0, successRate: 0, owner: "Legal" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Compliance frameworks
// ─────────────────────────────────────────────────────────────────────────────
export const frameworks: ComplianceFramework[] = [
  { id: "FW-001", name: "ISO 42001 — AI Management", shortName: "ISO 42001", controls: 86, controlsPassed: 78, owner: "Governance Council", health: "on-track", dueDate: "2026-08-30", domain: "International" },
  { id: "FW-002", name: "NIST AI Risk Management Framework", shortName: "NIST AI RMF", controls: 72, controlsPassed: 64, owner: "Security Team", health: "on-track", dueDate: "2026-09-15", domain: "US Federal" },
  { id: "FW-003", name: "EU AI Act Readiness", shortName: "EU AI Act", controls: 94, controlsPassed: 71, owner: "Legal Team", health: "at-risk", dueDate: "2026-08-02", domain: "European Union" },
  { id: "FW-004", name: "SOC 2 AI Controls", shortName: "SOC 2 AI", controls: 48, controlsPassed: 47, owner: "Trust & Safety", health: "complete", dueDate: "2026-06-12", domain: "Customer" },
  { id: "FW-005", name: "Internal AI Governance Policy", shortName: "Internal AIGP", controls: 36, controlsPassed: 28, owner: "Governance Council", health: "behind", dueDate: "2026-07-20", domain: "Internal" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Risk rollups
// ─────────────────────────────────────────────────────────────────────────────
export const riskRollups: RiskRollup[] = [
  { label: "Use-case risks",   critical: 3, high: 8, medium: 14, low: 22, trend: -4 },
  { label: "Model risks",      critical: 1, high: 5, medium: 9,  low: 18, trend: -2 },
  { label: "Vendor risks",     critical: 0, high: 4, medium: 7,  low: 11, trend: +1 },
  { label: "Policy violations",critical: 2, high: 6, medium: 12, low: 19, trend: -6 },
  { label: "Runtime scoring",  critical: 4, high: 9, medium: 16, low: 24, trend: -1 },
]

export const topActiveRisks = [
  { id: "RSK-101", title: "Unbounded PII flow into GPT-4o (Customer Support)", domain: "Use Case", severity: "critical" as SeverityLevel, owner: "Privacy Team", age: "3d" },
  { id: "RSK-102", title: "Vendor onboarding lacks DPA for Mistral",       domain: "Vendor",   severity: "high" as SeverityLevel,     owner: "Ops Team",     age: "6d" },
  { id: "RSK-103", title: "Bias threshold exceeded for HR recommender",    domain: "Model",    severity: "high" as SeverityLevel,     owner: "AI Ethics",    age: "2d" },
  { id: "RSK-104", title: "Staging model reachable from production keys",  domain: "Runtime",  severity: "medium" as SeverityLevel,   owner: "Security",     age: "12h" },
  { id: "RSK-105", title: "Fairness policy under review for 14 days",      domain: "Policy",   severity: "medium" as SeverityLevel,   owner: "Governance",   age: "14d" },
]

// ─────────────────────────────────────────────────────────────────────────────
// AI Advisor recommendations
// ─────────────────────────────────────────────────────────────────────────────
export const advisorRecommendations: AdvisorRecommendation[] = [
  {
    id: "ADV-001",
    title: "Remediate 2 critical EU AI Act controls",
    description: "Article 9 risk assessment and Article 12 logging controls are blocking audit readiness ahead of the August 2 deadline.",
    tone: "critical",
    category: "Compliance",
    impact: "Closes 2 audit blockers",
    action: "Open remediation plan",
    cta: "Review",
  },
  {
    id: "ADV-002",
    title: "Approve PII redaction policy v2.4",
    description: "Draft policy has cleared legal and security review. Awaiting governance council sign-off for production rollout.",
    tone: "warning",
    category: "Policy",
    impact: "Reduces violation rate by ~18%",
    action: "Review and approve",
    cta: "Approve",
  },
  {
    id: "ADV-003",
    title: "Onboard Mistral AI vendor to approved list",
    description: "Pilot completed with acceptable risk score. DPA, SOC 2 attestation, and data residency docs are now in place.",
    tone: "info",
    category: "Vendor",
    impact: "Unblocks 1 staging model",
    action: "Send to onboarding",
    cta: "Continue",
  },
  {
    id: "ADV-004",
    title: "Governance posture is healthy",
    description: "All critical controls are passing across ISO 42001 and NIST AI RMF. No outstanding escalations across the platform.",
    tone: "success",
    category: "Posture",
    impact: "Maintain current cadence",
    action: "View posture report",
    cta: "View",
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Audit timeline (governance actions)
// ─────────────────────────────────────────────────────────────────────────────
export const auditTimeline: AuditTimelineEvent[] = [
  { id: "TL-501", type: "enforcement", title: "PII redaction enforced on prod prompt",     actor: "policy-engine",  resource: "PII Data Protection", timestamp: "2026-06-06T14:32:11Z", meta: "Risk 92" },
  { id: "TL-500", type: "incident",    title: "INC-2401 opened — prompt injection",        actor: "shield.detect",  resource: "GPT-4o",              timestamp: "2026-06-06T14:32:00Z", meta: "Critical" },
  { id: "TL-499", type: "approval",    title: "Code Reviewer agent promoted to active",    actor: "Sarah Chen",     resource: "AGT-002",              timestamp: "2026-06-06T14:21:44Z" },
  { id: "TL-498", type: "policy",      title: "AI Fairness & Bias policy v1.7 published",  actor: "AI Ethics Board", resource: "POL-007",              timestamp: "2026-06-06T13:48:09Z" },
  { id: "TL-497", type: "enforcement", title: "Jailbreak pattern blocked in code assistant", actor: "policy-engine", resource: "Jailbreak Prevention", timestamp: "2026-06-06T13:18:02Z", meta: "Risk 88" },
  { id: "TL-496", type: "access",      title: "Vendor token rotated for staging",          actor: "ops-bot",        resource: "Mistral",              timestamp: "2026-06-06T12:30:55Z" },
  { id: "TL-495", type: "incident",    title: "INC-2396 escalated to legal",               actor: "Sarah Chen",     resource: "POL-008",              timestamp: "2026-06-06T11:55:21Z" },
  { id: "TL-494", type: "policy",      title: "Vendor Authorization controls tightened",   actor: "Security Team",  resource: "POL-008",              timestamp: "2026-06-06T10:11:00Z" },
  { id: "TL-493", type: "enforcement", title: "Secrets regex matched AWS key pattern",     actor: "policy-engine",  resource: "Secrets Detection",    timestamp: "2026-06-05T22:14:11Z", meta: "Risk 95" },
  { id: "TL-492", type: "approval",    title: "EU AI Act assessor workspace granted",      actor: "Legal Team",     resource: "Compliance",           timestamp: "2026-06-05T19:04:33Z" },
]
