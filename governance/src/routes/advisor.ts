import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { v4 as uuidv4 } from "uuid";
import { getTraceId } from "../platform/requestContext";
import { sendRouteError } from "./routeUtils";

export const advisorRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
const PRIMARY_ADVISOR_MODEL = process.env.PRIMARY_ADVISOR_MODEL || "llama3.2:3b";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "tinyllama";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "nomic-embed-text";

type IncidentAdvisorInput = {
  orgId: string;
  userId?: string | null;
  traceId: string;
  incidentType: string;
  severity: string;
  offendingPrompt: string;
  detectionEvidence: Record<string, unknown>;
  violatedPolicy: string;
  incidentId?: string | null;
};

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeAdvisorPayload(payload: Record<string, unknown>) {
  const risk = String(payload.risk_level || "MEDIUM").toUpperCase();
  const allowedRisk = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(risk) ? risk : "MEDIUM";
  const remediation = Array.isArray(payload.remediation)
    ? payload.remediation.map((item) => String(item))
    : [
        "Review the detection evidence tied to this trace_id.",
        "Confirm whether the violating workflow should remain blocked.",
        "Update policy coverage or user guidance before re-enabling the workflow.",
      ];

  return {
    summary: String(payload.summary || "A governed AI security incident was detected and requires review."),
    risk_level: allowedRisk,
    remediation,
    compliance_impact: String(
      payload.compliance_impact ||
        "This touches GDPR, HIPAA, and the AI Act depending on whether personal, health, or high-risk model data was involved.",
    ),
  };
}

async function getAvailableModel(): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return FALLBACK_MODEL;
    const data = await res.json() as any;
    const models: string[] = (data.models || []).map((m: any) => m.name);
    if (models.some((m) => m.startsWith(PRIMARY_ADVISOR_MODEL))) return PRIMARY_ADVISOR_MODEL;
    if (models.some((m) => m.startsWith(FALLBACK_MODEL))) return FALLBACK_MODEL;
    return models[0] || PRIMARY_ADVISOR_MODEL;
  } catch {
    return FALLBACK_MODEL;
  }
}

export async function queryOllama(prompt: string, system?: string): Promise<string> {
    const model = await getAvailableModel();
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, system: system || "", prompt, stream: false }),
    });
    if (!res.ok) throw new Error("Ollama unavailable");
    const data = (await res.json()) as any;
    return data.response || "";
}

export async function generateIncidentAdvisorSummary(input: IncidentAdvisorInput) {
    const prompt = `You are an enterprise AI governance advisor. You analyze AI security incidents and provide clear, actionable guidance for security and compliance teams.
Given an incident report, respond ONLY with valid JSON (no markdown, no preamble) in this exact structure:
{
"summary": "2-3 sentence plain English summary of what happened and why it's a risk",
"risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
"remediation": ["step 1", "step 2", "step 3"],
"compliance_impact": "Which regulations this touches (GDPR, HIPAA, AI Act) and why"
}

Pass to the user message: the incident type, severity, the offending prompt (truncated to 500 chars), the detection evidence JSON, and the policy that was violated.

Incident type: ${input.incidentType}
Severity: ${input.severity}
Offending prompt: ${input.offendingPrompt.slice(0, 500)}
Detection evidence JSON: ${JSON.stringify(input.detectionEvidence)}
Policy violated: ${input.violatedPolicy}`;

    let responseText = "";
    try {
      responseText = await queryOllama(prompt, "Return strict JSON only.");
    } catch {
      responseText = "";
    }

    const parsed = responseText ? extractJsonObject(responseText) : null;
    const normalized = normalizeAdvisorPayload(parsed || {});

    await prisma.auditLog.create({
      data: {
        orgId: input.orgId,
        userId: input.userId || null,
        traceId: input.traceId,
        action: "REPORT_GENERATED",
        resource: "advisor_incident_summary",
        resourceId: input.incidentId || input.traceId,
        severity: input.severity as any,
        details: {
          traceId: input.traceId,
          incidentId: input.incidentId || null,
          incidentType: input.incidentType,
          violatedPolicy: input.violatedPolicy,
          advisor: normalized,
        },
      },
    });

    return normalized;
}

async function getEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
    });
    if (!res.ok) throw new Error("Embedding service unavailable");
    const data = (await res.json()) as any;
    return data.embedding || [];
}

function cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return normA && normB ? dot / (normA * normB) : 0;
}

function buildDemoComplianceImpact(categories: string[], action: string) {
    const impacts = [
        "Auditability preserved through immutable request tracing.",
        "Human review remains possible through linked incident evidence.",
    ];
    if (categories.includes("PII")) {
        impacts.unshift("GDPR-sensitive personal data was intercepted before external model exposure.");
        impacts.push("ISO 27001 data handling controls were reinforced by policy enforcement.");
    }
    if (categories.includes("PROMPT_INJECTION")) {
        impacts.unshift("Prompt injection safeguards reduced the chance of model instruction compromise.");
    }
    if (action === "BLOCK") {
        impacts.push("Provider egress was prevented, limiting downstream compliance blast radius.");
    }
    return impacts;
}

async function buildOrgContext(orgId: string) {
    const [incidents, models, complianceChecks, recentThreats, recentAudits] = await Promise.all([
        prisma.incident.findMany({ where: { orgId, status: { not: "RESOLVED_CLOSED" } }, orderBy: { createdAt: "desc" }, take: 10 }),
        prisma.aIModel.count({ where: { orgId } }),
        prisma.complianceCheck.findMany({ where: { orgId }, select: { framework: true, score: true, status: true } }),
        prisma.threatDetection.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { detectedAt: "desc" }, take: 10 }),
        prisma.auditEvent.findMany({ where: { orgId }, orderBy: { timestamp: "desc" }, take: 20 }),
    ]);
    return { incidents, models, complianceChecks, recentThreats, recentAudits };
}

// POST /api/advisor/chat — Streaming response from Ollama
advisorRouter.post("/chat", async (req: Request, res: Response) => {
    try {
        const { message, sessionId } = req.body;
        if (!message) {
            res.status(400).json({ error: "message required" });
            return;
        }

        const sid = sessionId || uuidv4();
        const orgId = req.user!.orgId;
        const userId = req.user!.userId;

        // Fetch org context for system prompt
        const [incidents, models, complianceChecks] = await Promise.all([
            prisma.incident.count({ where: { orgId, status: { not: "RESOLVED_CLOSED" } } }),
            prisma.aIModel.count({ where: { orgId } }),
            prisma.complianceCheck.findMany({
                where: { orgId },
                select: { framework: true, score: true },
            }),
        ]);

        const avgCompliance =
            complianceChecks.length > 0
                ? Math.round(complianceChecks.reduce((s, c) => s + c.score, 0) / complianceChecks.length)
                : 0;

        // Get conversation history
        const history = await prisma.advisorMessage.findMany({
            where: { sessionId: sid, orgId },
            orderBy: { createdAt: "asc" },
            take: 20,
        });

        const systemPrompt = `You are Airlock Advisor, an expert AI governance consultant specializing in EU AI Act, ISO 42001, NIST AI RMF, and ISO 27001. You run entirely on-premise — no data ever leaves this system. Always cite specific regulation articles. Be concise and actionable.

Current org context:
- AI Models registered: ${models}
- Active incidents: ${incidents}
- Average compliance score: ${avgCompliance}%
- Compliance by framework: ${complianceChecks.map((c) => `${c.framework}: ${c.score}%`).join(", ") || "None"}`;

        const messages = [
            ...history.map((m) => `${m.role === "USER" ? "User" : "Assistant"}: ${m.content}`),
            `User: ${message}`,
        ].join("\n\n");

        // Save user message
        await prisma.advisorMessage.create({
            data: { orgId, userId, sessionId: sid, role: "USER", content: message },
        });

        // Stream from Ollama (async-only, non-blocking)
        const activeModel = await getAvailableModel();
        const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: activeModel,
                system: systemPrompt,
                prompt: messages,
                stream: true,
            }),
        });

        if (!ollamaRes.ok || !ollamaRes.body) {
            res.status(502).json({ error: "Ollama unavailable" });
            return;
        }

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Session-Id", sid);

        let fullResponse = "";
        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n").filter((l) => l.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.response) {
                            fullResponse += data.response;
                            res.write(`data: ${JSON.stringify({ token: data.response, sessionId: sid })}\n\n`);
                        }
                        if (data.done) {
                            res.write(`data: ${JSON.stringify({ done: true, sessionId: sid })}\n\n`);
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } catch (streamErr) {
            console.error("Stream error:", streamErr);
        }

        // Save assistant message
        if (fullResponse) {
            await prisma.advisorMessage.create({
                data: {
                    orgId,
                    userId,
                    sessionId: sid,
                    role: "ASSISTANT",
                    content: fullResponse,
                },
            });
        }

        res.end();
    } catch (err: any) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// GET /api/advisor/history
advisorRouter.get("/history", async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.query;
        const where: any = { orgId: req.user!.orgId, userId: req.user!.userId };
        if (sessionId) where.sessionId = sessionId;

        const messages = await prisma.advisorMessage.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: 100,
        });
        res.json(messages);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/advisor/context — Build enriched org context for RAG
advisorRouter.post("/context", async (req: Request, res: Response) => {
    try {
        const ctx = await buildOrgContext(req.user!.orgId);
        const summary = {
            activeIncidents: ctx.incidents.length,
            totalModels: ctx.models,
            avgComplianceScore: ctx.complianceChecks.length > 0
                ? Math.round(ctx.complianceChecks.reduce((s, c) => s + c.score, 0) / ctx.complianceChecks.length) : 0,
            activeThreats: ctx.recentThreats.length,
            recentAuditCount: ctx.recentAudits.length,
            topIncidents: ctx.incidents.slice(0, 5).map(i => ({ title: i.title, severity: i.severity, status: i.status })),
            topThreats: ctx.recentThreats.slice(0, 5).map(t => ({ patternType: t.patternType, severity: t.severity, detectedAt: t.detectedAt })),
            complianceByFramework: ctx.complianceChecks.map(c => ({ framework: c.framework, score: c.score, status: c.status })),
            recentAuditActions: ctx.recentAudits.slice(0, 10).map(a => ({ action: a.actionTaken, riskScore: a.riskScore, timestamp: a.timestamp })),
        };
        res.json(summary);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/advisor/recommend — Generate policy recommendations
advisorRouter.post("/recommend", async (req: Request, res: Response) => {
    try {
        const ctx = await buildOrgContext(req.user!.orgId);
        const prompt = `You are an AI governance policy expert. Based on the following org context, provide 5 specific, actionable policy recommendations:

Org Context:
- AI Models registered: ${ctx.models}
- Active incidents: ${ctx.incidents.length}
  ${ctx.incidents.slice(0, 5).map(i => `  - ${i.title} (${i.severity})`).join("\n")}
- Compliance scores: ${ctx.complianceChecks.map(c => `${c.framework}: ${c.score}% (${c.status})`).join(", ")}
- Active threats: ${ctx.recentThreats.length}
  ${ctx.recentThreats.slice(0, 5).map(t => `  - ${t.patternType} (${t.severity})`).join("\n")}
- Recent audit actions: ${ctx.recentAudits.slice(0, 10).map(a => `${a.actionTaken} (risk: ${a.riskScore})`).join(", ")}

For each recommendation provide:
1. Policy name
2. Target action (BLOCK, WARN, REDACT, ALLOW)
3. Conditions/triggers
4. Priority (HIGH/MEDIUM/LOW)
5. Rationale citing specific risks or compliance gaps

Format as JSON array.`;

        const response = await queryOllama(prompt);
        // Try to parse as JSON, fall back to text
        try {
            const parsed = JSON.parse(response);
            res.json({ recommendations: Array.isArray(parsed) ? parsed : JSON.parse(parsed.match(/\[.*\]/s)?.[0] || "[]") });
        } catch {
            res.json({ recommendations: [], rawAnalysis: response });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

advisorRouter.post("/incident-summary", async (req: Request, res: Response) => {
    try {
        const traceId = getTraceId(req);
        const payload = await generateIncidentAdvisorSummary({
            orgId: req.user!.orgId,
            userId: req.user!.userId,
            traceId,
            incidentType: String(req.body?.incidentType || "policy_violation"),
            severity: String(req.body?.severity || "MEDIUM"),
            offendingPrompt: String(req.body?.offendingPrompt || ""),
            detectionEvidence:
                req.body?.detectionEvidence && typeof req.body.detectionEvidence === "object"
                    ? req.body.detectionEvidence
                    : {},
            violatedPolicy: String(req.body?.violatedPolicy || "Unspecified policy"),
            incidentId: req.body?.incidentId ? String(req.body.incidentId) : null,
        });
        res.json(payload);
    } catch (err) {
        sendRouteError(res, req, "advisor.incident-summary", err);
    }
});

advisorRouter.post("/demo-summary", async (req: Request, res: Response) => {
    try {
        const {
            prompt,
            traceId,
            incidentId,
            action = "ALLOW",
            riskScore = 0,
            categories = [],
            policyName = "Golden Demo - Block Sensitive Customer Data",
            provider = "OpenAI",
        } = req.body || {};

        const orgId = req.user!.orgId;
        const userId = req.user!.userId;
        const complianceChecks = await prisma.complianceCheck.findMany({
            where: { orgId },
            select: { framework: true, score: true, status: true },
            take: 6,
        });

        const complianceImpact = buildDemoComplianceImpact(
            Array.isArray(categories) ? categories : [],
            String(action),
        );
        const highestFramework = complianceChecks[0]?.framework || "EU_AI_ACT";
        const summary =
            action === "BLOCK"
                ? `Sensitive customer data was detected and blocked before the request could be sent to ${provider}.`
                : `The request completed the governance pipeline and remained within the configured risk posture.`;
        const rationale =
            action === "BLOCK"
                ? `${policyName} matched ${Array.isArray(categories) && categories.length > 0 ? categories.join(", ") : "the detected policy context"} at risk score ${riskScore}.`
                : `No blocking policy matched the request, so the proxy allowed the workflow to continue.`;
        const remediation = action === "BLOCK"
            ? [
                "Mask or tokenize direct identifiers before sending the prompt to any external model.",
                "Route the task through an approved internal assistant for customer-data use cases.",
                "Review the linked incident evidence and confirm whether the user needs coaching or policy tuning.",
            ]
            : [
                "Keep the request inside approved provider boundaries.",
                "Continue monitoring for repeated risky patterns in the same workspace.",
            ];

        await prisma.auditLog.create({
            data: {
                orgId,
                userId,
                traceId: traceId || null,
                action: "REPORT_GENERATED",
                resource: "advisor_demo_summary",
                resourceId: incidentId || traceId || null,
                details: {
                    traceId,
                    incidentId,
                    action,
                    riskScore,
                    categories,
                    provider,
                    promptPreview: String(prompt || "").slice(0, 120),
                    frameworkHint: highestFramework,
                },
            },
        });

        res.json({
            summary,
            rationale,
            remediation,
            complianceImpact,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/advisor/embed-search — Semantic search across telemetry
advisorRouter.post("/embed-search", async (req: Request, res: Response) => {
    try {
        const { query } = req.body;
        if (!query) {
            res.status(400).json({ error: "query required" });
            return;
        }

        const ctx = await buildOrgContext(req.user!.orgId);

        // Build searchable text corpus from telemetry
        const corpus: { text: string; source: string; id: string; severity?: string; date: Date }[] = [];

        for (const inc of ctx.incidents) {
            corpus.push({ text: `Incident: ${inc.title}. ${inc.description}`, source: "incident", id: inc.id, severity: inc.severity, date: inc.createdAt });
        }
        for (const t of ctx.recentThreats) {
            corpus.push({ text: `Threat: ${t.patternType}. ${JSON.stringify(t.details)}`, source: "threat", id: t.id, severity: t.severity, date: t.detectedAt });
        }
        for (const c of ctx.complianceChecks) {
            corpus.push({ text: `Compliance: ${c.framework} score ${c.score}% status ${c.status}`, source: "compliance", id: c.framework, date: new Date() });
        }
        for (const a of ctx.recentAudits) {
            corpus.push({ text: `Audit: action ${a.actionTaken} risk ${a.riskScore} provider ${a.llmProvider} tool ${a.toolName}`, source: "audit", id: a.id, severity: String(a.riskScore), date: a.timestamp });
        }

        // Get query embedding
        const queryEmb = await getEmbedding(query);

        // Score and rank by cosine similarity
        const scored = await Promise.all(
            corpus.map(async (item) => {
                let score = 0;
                try {
                    const itemEmb = await getEmbedding(item.text.substring(0, 500));
                    score = cosineSimilarity(queryEmb, itemEmb);
                } catch { /* skip items that fail embedding */ }
                return { ...item, score };
            })
        );

        const results = scored
            .filter(r => r.score > 0.3)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        res.json({ query, results });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
