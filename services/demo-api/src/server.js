const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const jwt = require('jsonwebtoken')
const { randomUUID } = require('crypto')

const app = express()
const PORT = Number(process.env.DEMO_API_PORT || 4001)
const JWT_SECRET = process.env.DEMO_JWT_SECRET || 'demo-secret-change-in-production'

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors())
app.use(express.json())

const auditLogs = []

function seedDemoData() {
  if (auditLogs.length > 0) return

  const now = Date.now()
  const seedEntries = [
    {
      action: 'demo_seed_runtime_block',
      source: 'seed',
      details: {
        severity: 'HIGH',
        user: 'EMP-1293',
        actionTaken: 'BLOCK',
        riskScore: 91,
        categories: ['PROMPT_INJECTION'],
      },
      createdAt: new Date(now - 1000 * 60 * 18).toISOString(),
      severity: 'HIGH',
    },
    {
      action: 'demo_seed_redaction',
      source: 'seed',
      details: {
        severity: 'MEDIUM',
        user: 'EMP-2204',
        actionTaken: 'REDACT',
        riskScore: 67,
        categories: ['CONFIDENTIAL', 'EMAIL'],
      },
      createdAt: new Date(now - 1000 * 60 * 12).toISOString(),
      severity: 'MEDIUM',
    },
    {
      action: 'demo_seed_allow',
      source: 'seed',
      details: {
        severity: 'LOW',
        user: 'EMP-4410',
        actionTaken: 'ALLOW',
        riskScore: 18,
        categories: [],
      },
      createdAt: new Date(now - 1000 * 60 * 7).toISOString(),
      severity: 'LOW',
    },
  ]

  for (const entry of seedEntries) {
    auditLogs.push({ id: randomUUID(), ...entry })
  }
}

seedDemoData()

function createDemoToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      scope: 'demo',
    },
    JWT_SECRET,
    { expiresIn: '12h' },
  )
}

function addAudit(action, details = {}, source = 'demo-api') {
  const entry = {
    id: randomUUID(),
    action,
    source,
    details,
    createdAt: new Date().toISOString(),
    severity: details.severity || 'LOW',
  }
  auditLogs.push(entry)
  if (auditLogs.length > 200) auditLogs.shift()
  return entry
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'Demo authentication required' })
    return
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired demo token' })
  }
}

function analyzePrompt(text) {
  const content = String(text || '')
  const lowered = content.toLowerCase()
  const spans = []
  let risk = 12
  let action = 'ALLOW'

  if (/\b\d{3}-\d{2}-\d{4}\b/.test(content)) {
    spans.push({ label: 'PII', text: 'SSN detected', start: 0, end: 11 })
    risk = Math.max(risk, 82)
    action = 'BLOCK'
  }

  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(content)) {
    spans.push({ label: 'EMAIL', text: 'Email detected', start: 0, end: 5 })
    risk = Math.max(risk, 56)
    if (action !== 'BLOCK') action = 'REDACT'
  }

  if (/ignore previous instructions|system prompt|jailbreak|reveal/i.test(lowered)) {
    spans.push({ label: 'JAILBREAK', text: 'Prompt injection signal', start: 0, end: 10 })
    risk = Math.max(risk, 91)
    action = 'BLOCK'
  }

  if (/confidential|salary band|internal only|secret/i.test(lowered)) {
    spans.push({ label: 'CONFIDENTIAL', text: 'Sensitive content request', start: 0, end: 12 })
    risk = Math.max(risk, 68)
    if (action === 'ALLOW') action = 'REDACT'
  }

  return {
    risk_score: risk,
    action,
    detected_spans: spans,
    simulated: true,
    demoMode: true,
    sandboxId: `sandbox_${randomUUID().slice(0, 8)}`,
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'demo-api', version: '0.1.0' })
})

app.post('/api/demo/auth/login', (req, res) => {
  const email = req.body?.email || 'demo@airlock.io'
  const user = {
    id: randomUUID(),
    email,
    name: 'Demo User',
    role: 'LAB_USER',
  }
  const accessToken = createDemoToken(user)
  addAudit('demo_login', { email, severity: 'LOW' }, 'lab-auth')
  res.json({ accessToken, user })
})

app.post('/api/demo/auth/signup', (req, res) => {
  const email = req.body?.email || 'demo@airlock.io'
  const name = req.body?.name || 'Demo User'
  const user = {
    id: randomUUID(),
    email,
    name,
    role: 'LAB_USER',
  }
  const accessToken = createDemoToken(user)
  addAudit('demo_signup', { email, severity: 'LOW' }, 'lab-auth')
  res.status(201).json({ accessToken, user })
})

app.post('/api/demo/login', (req, res) => {
  const email = req.body?.email || 'demo@airlock.io'
  const user = {
    id: randomUUID(),
    email,
    name: 'Demo User',
    role: 'LAB_USER',
  }
  const accessToken = createDemoToken(user)
  res.json({ accessToken, user })
})

app.post('/api/demo/signup', (req, res) => {
  const email = req.body?.email || 'demo@airlock.io'
  const name = req.body?.name || 'Demo User'
  const user = {
    id: randomUUID(),
    email,
    name,
    role: 'LAB_USER',
  }
  const accessToken = createDemoToken(user)
  addAudit('demo_signup', { email, severity: 'LOW' }, 'lab-auth')
  res.status(201).json({ accessToken, user })
})

app.get('/api/demo/me', authMiddleware, (req, res) => {
  res.json({ user: req.user, demoMode: true })
})

app.post('/api/demo/prompt/inspect', authMiddleware, (req, res) => {
  const result = analyzePrompt(req.body?.text || '')
  addAudit('prompt_inspect', { riskScore: result.risk_score, action: result.action }, 'prompt-inspector')
  res.json(result)
})

app.post('/api/demo/policy/simulate', authMiddleware, (req, res) => {
  const prompt = String(req.body?.prompt || '')
  const rules = Array.isArray(req.body?.rules) ? req.body.rules : []
  const analysis = analyzePrompt(prompt)
  const appliedRules = rules.map((rule) => {
    const name = String(rule?.name || 'unnamed_rule')
    const matched =
      (name.includes('pii') && analysis.detected_spans.some((span) => span.label === 'PII' || span.label === 'EMAIL')) ||
      (name.includes('jailbreak') && analysis.detected_spans.some((span) => span.label === 'JAILBREAK')) ||
      (name.includes('confidential') && analysis.detected_spans.some((span) => span.label === 'CONFIDENTIAL')) ||
      (name.includes('redact') && analysis.action === 'REDACT')
    return { rule: name, matched }
  })

  const response = {
    action: analysis.action,
    riskScore: analysis.risk_score,
    appliedRules,
    simulated: true,
  }
  addAudit('policy_simulate', { action: response.action, rules: appliedRules.length, severity: 'MEDIUM' }, 'policy-simulator')
  res.json(response)
})

app.get('/api/demo/audit/logs', authMiddleware, (_req, res) => {
  res.json(auditLogs)
})

app.post('/api/demo/audit/log', authMiddleware, (req, res) => {
  const entry = addAudit(req.body?.action || 'manual_event', req.body?.details || {}, req.body?.source || 'lab-ui')
  res.status(201).json(entry)
})

app.post('/api/demo/shadow-ai/simulate', authMiddleware, (_req, res) => {
  const payload = {
    simulated: true,
    detections: [
      { service: 'Unknown LLM Gateway', risk: 'HIGH', users: 4, status: 'new' },
      { service: 'Unsanctioned Browser Plugin', risk: 'MEDIUM', users: 11, status: 'investigating' },
    ],
    summary: {
      totalFindings: 2,
      highRisk: 1,
      mediumRisk: 1,
    },
  }
  addAudit('shadow_ai_scan', { findings: payload.summary.totalFindings, severity: 'HIGH' }, 'shadow-ai')
  res.json(payload)
})

app.post('/api/demo/attack/replay', authMiddleware, (req, res) => {
  const vector = req.body?.vector || 'prompt_injection'
  const payload = {
    simulated: true,
    vector,
    blocked: true,
    severity: 'HIGH',
    attackId: `attack_${randomUUID().slice(0, 8)}`,
    notes: 'Replay intercepted by sandbox controls before reaching an upstream model.',
  }
  addAudit('attack_replay', { vector, severity: 'HIGH' }, 'attack-replay')
  res.json(payload)
})

app.listen(PORT, () => {
  console.log(`[demo-api] listening on ${PORT}`)
})
