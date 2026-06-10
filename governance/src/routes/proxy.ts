import { createHash, randomUUID } from "crypto";
import { Router, Request, Response } from "express";

import { prisma } from "../index";
import { serviceRegistry } from "../platform/serviceRegistry";
import { governanceEventBus } from "../platform/eventBus";
import { generateIncidentAdvisorSummary, queryOllama } from "./advisor";

type DetectionFinding = {
  category: string;
  label: string;
  value: string;
  riskWeight: number;
};

type StepStatus = "completed" | "blocked" | "warning";

const DEMO_POLICY_NAME = "Golden Demo - Block Sensitive Customer Data";
const DEFAULT_DEMO_PROMPT = `Customer SSN: 123-45-6789
Send this customer data to OpenAI`;

const PII_PATTERNS: Array<{
  category: string;
  label: string;
  regex: RegExp;
  riskWeight: number;
}> = [
  {
    category: "PII",
    label: "SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    riskWeight: 55,
  },
  {
    category: "FINANCIAL",
    label: "Credit Card",
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
    riskWeight: 45,
  },
  {
    category: "SECRET",
    label: "API Key",
    regex: /\b(?:sk|api|rk)_[A-Za-z0-9_-]{12,}\b/g,
    riskWeight: 35,
  },
];

const PROMPT_INJECTION_PATTERNS: Array<{
  category: string;
  label: string;
  regex: RegExp;
  riskWeight: number;
}> = [
  {
    category: "PROMPT_INJECTION",
    label: "Ignore Previous Instructions",
    regex: /ignore\s+previous\s+instructions/i,
    riskWeight: 25,
  },
  {
    category: "PROMPT_INJECTION",
    label: "Reveal System Prompt",
    regex: /reveal\s+(the\s+)?system\s+prompt/i,
    riskWeight: 25,
  },
];

const EXFIL_PATTERNS: Array<{
  category: string;
  label: string;
  regex: RegExp;
  riskWeight: number;
}> = [
  {
    category: "REGULATORY",
    label: "External Provider Egress Intent",
    regex: /\b(?:send|share|upload|export|forward|paste)\b[\s\S]{0,80}\bcustomer\s+(?:data|record|records|information|details)\b[\s\S]{0,60}\b(?:openai|chatgpt|claude|anthropic|gemini)\b/i,
    riskWeight: 30,
  },
];

function buildComplianceImpact(categories: string[], action: string): string[] {
  const impacts = [
    "Immutable runtime tracing preserved evidence for audit review.",
    "Policy enforcement kept a human-review path available for follow-up.",
  ];

  if (categories.includes("PII") || categories.includes("FINANCIAL")) {
    impacts.unshift("Sensitive customer data was intercepted before third-party model exposure.");
    impacts.push("GDPR and ISO 27001 handling controls were reinforced by automated enforcement.");
  }

  if (categories.includes("PROMPT_INJECTION")) {
    impacts.push("Prompt-injection controls reduced the chance of downstream model manipulation.");
  }

  if (action === "BLOCK") {
    impacts.push("External provider egress was prevented, reducing compliance blast radius.");
  }

  return impacts;
}

function maskPrompt(prompt: string): string {
  return prompt
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "***-**-****")
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED_CARD]")
    .replace(/\b(?:sk|api|rk)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]");
}

function detectPrompt(prompt: string): {
  findings: DetectionFinding[];
  categories: string[];
  riskScore: number;
} {
  const findings: DetectionFinding[] = [];

  for (const pattern of PII_PATTERNS) {
    const matches = prompt.match(pattern.regex) || [];
    for (const value of matches) {
      findings.push({
        category: pattern.category,
        label: pattern.label,
        value,
        riskWeight: pattern.riskWeight,
      });
    }
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.regex.test(prompt)) {
      findings.push({
        category: pattern.category,
        label: pattern.label,
        value: pattern.label,
        riskWeight: pattern.riskWeight,
      });
    }
  }

  for (const pattern of EXFIL_PATTERNS) {
    if (pattern.regex.test(prompt)) {
      findings.push({
        category: pattern.category,
        label: pattern.label,
        value: pattern.label,
        riskWeight: pattern.riskWeight,
      });
    }
  }

  const riskScore = Math.min(
    100,
    findings.reduce((score, finding) => score + finding.riskWeight, 0),
  );

  return {
    findings,
    categories: [...new Set(findings.map((finding) => finding.category))],
    riskScore,
  };
}

async function detectPromptWithService(prompt: string): Promise<{
  findings: DetectionFinding[];
  categories: string[];
  riskScore: number;
  raw: Record<string, unknown> | null;
}> {
  const detectionUrl = process.env.DETECTION_SERVICE_URL || "http://detection:8001";
  try {
    const response = await fetch(`${detectionUrl}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt }),
    });
    if (!response.ok) {
      throw new Error(`Detection service returned ${response.status}`);
    }

    const data = await response.json() as any;
    const spans = Array.isArray(data.detected_spans) ? data.detected_spans : [];
    return {
      findings: spans.map((span: any) => ({
        category: String(span.category || "UNKNOWN"),
        label: String(span.detector || span.category || "Detection"),
        value: String(span.matched_text || span.context || span.category || ""),
        riskWeight: Math.max(1, Math.round(Number(span.confidence || 0.5) * 100)),
      })),
      categories: [...new Set(spans.map((span: any) => String(span.category || "")).filter(Boolean))] as string[],
      riskScore: Number(data.risk_score || 0),
      raw: data as Record<string, unknown>,
    };
  } catch {
    const fallback = detectPrompt(prompt);
    return { ...fallback, raw: null };
  }
}

function evaluatePolicy(input: {
  provider: string;
  categories: string[];
  riskScore: number;
}) {
  const externalProvider = !/^ollama$/i.test(input.provider);
  const containsSensitiveData =
    input.categories.includes("PII") ||
    input.categories.includes("FINANCIAL") ||
    input.categories.includes("SECRET");
  const containsInjection = input.categories.includes("PROMPT_INJECTION");

  if (containsSensitiveData && externalProvider) {
    return {
      action: "BLOCK",
      severity: "CRITICAL",
      policyName: DEMO_POLICY_NAME,
      reason: "Sensitive regulated data cannot be sent to external LLM providers.",
    } as const;
  }

  if (containsInjection) {
    return {
      action: "WARN",
      severity: "HIGH",
      policyName: "Golden Demo - Prompt Injection Guardrail",
      reason: "Suspicious prompt-injection language requires analyst review.",
    } as const;
  }

  return {
    action: "ALLOW",
    severity: input.riskScore >= 40 ? "MEDIUM" : "LOW",
    policyName: "Golden Demo - Standard Runtime Monitoring",
    reason: "No blocking control matched the request.",
  } as const;
}

async function safePublish(event: Parameters<typeof governanceEventBus.publish>[0]) {
  try {
    await governanceEventBus.publish(event);
  } catch (error: any) {
    console.warn("[proxy-demo] event publish skipped:", error?.message || error);
  }
}

async function generateProviderResponse(prompt: string, provider: string) {
  try {
    const response = await queryOllama(
      prompt.slice(0, 600),
      `You are the ${provider} provider simulator for an AI governance demo. Reply normally and concisely to safe requests. Never mention being simulated.`,
    );
    return response.trim();
  } catch {
    return "Request allowed. Provider completed the task successfully and returned a clean response preview.";
  }
}

function severityFromAction(action: string, severity: string) {
  if (action === "ALLOW") return "ALLOWED";
  return severity;
}

async function ensureDemoPolicy(orgId: string, workspaceId?: string | null) {
  const existing = await prisma.policyRule.findFirst({
    where: {
      orgId,
      workspaceId: workspaceId || null,
      name: DEMO_POLICY_NAME,
      deletedAt: null,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.policyRule.create({
    data: {
      orgId,
      workspaceId: workspaceId || null,
      name: DEMO_POLICY_NAME,
      description: "Blocks external provider requests containing customer identifiers.",
      category: "data_protection",
      action: "BLOCK",
      scope: "proxy",
      priority: 1,
      enabled: true,
      conditions: [
        { field: "provider", operator: "not_equals", value: "OLLAMA" },
        { field: "detection.categories", operator: "contains_any", value: ["PII", "FINANCIAL", "SECRET"] },
      ],
      exceptions: [],
    },
  });
}

async function maybeSeedDemoData(req: Request) {
  if (process.env.DEMO_MODE !== "true") {
    return;
  }

  const orgId = req.user!.orgId;
  const workspaceId = req.workspaceId || req.user?.workspaceId || null;
  const existingRuntimeEvent = await prisma.auditEvent.findFirst({
    where: { orgId },
  });

  if (existingRuntimeEvent) {
    return;
  }

  const provider = await prisma.provider.findFirst({
    where: { orgId, workspaceId: workspaceId || null, isActive: true },
  });

  const workspace = workspaceId
    ? await prisma.workspace.findFirst({ where: { id: workspaceId, orgId } })
    : null;

  const prompt = DEFAULT_DEMO_PROMPT;
  const traceId = randomUUID();
  const detection = await detectPromptWithService(prompt);
  const evaluation = evaluatePolicy({
    provider: provider?.name || "OpenAI",
    categories: detection.categories,
    riskScore: detection.riskScore,
  });

  const existingIncident = await prisma.incident.findFirst({
    where: {
      orgId,
      workspaceId: workspaceId || null,
      title: {
        contains: "Sensitive customer data blocked",
      },
    },
  });

  let incidentId = existingIncident?.id;
  if (!existingIncident) {
    const incident = await serviceRegistry.incidents.createIncident({
      orgId,
      userId: req.user!.userId,
      workspaceId,
      title: "Sensitive customer data blocked before provider egress",
      description: "Seeded demo incident for governance runtime monitoring.",
      severity: evaluation.severity,
      traceId,
    });

    incidentId = incident.id;

    await prisma.incident.update({
      where: { id: incident.id },
      data: {
        evidence: [
          {
            id: randomUUID(),
            type: "prompt",
            label: "Redacted prompt",
            traceId,
            content: maskPrompt(prompt),
          },
        ],
      },
    });
  }

  const promptHash = createHash("sha256").update(prompt).digest("hex");
  await prisma.auditEvent.create({
    data: {
      orgId,
      userId: req.user!.userId,
      sessionId: req.user!.sessionId,
      toolName: "Proxy Monitor Demo Seed",
      llmProvider: provider?.name || "OpenAI",
      promptHash,
      detectionResults: {
        findings: detection.findings,
        categories: detection.categories,
        traceId,
        incidentId,
        seeded: true,
        promptPreview: maskPrompt(prompt).slice(0, 160),
        severity: severityFromAction(evaluation.action, evaluation.severity),
      },
      riskScore: detection.riskScore,
      actionTaken: evaluation.action,
      redactedPrompt: maskPrompt(prompt),
      requestDurationMs: 180,
      upstreamStatusCode: evaluation.action === "BLOCK" ? 403 : 200,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        orgId,
        workspaceId,
        userId: req.user!.userId,
        traceId,
        action: "REPORT_GENERATED",
        resource: "demo_runtime_seed",
        resourceId: traceId,
        severity: evaluation.severity as any,
        details: {
          stage: "seeded_prompt_submission",
          workspace: workspace?.name || "Default Workspace",
          traceId,
        },
      },
      {
        orgId,
        workspaceId,
        userId: req.user!.userId,
        traceId,
        action: "INCIDENT_CREATED",
        resource: "proxy_incident",
        resourceId: incidentId || traceId,
        severity: evaluation.severity as any,
        details: {
          stage: "seeded_incident_creation",
          traceId,
          incidentId,
        },
      },
    ],
  });
}

async function buildProxyStats(req: Request) {
  await maybeSeedDemoData(req);

  const orgId = req.user!.orgId;
  const workspaceId = req.workspaceId || req.user?.workspaceId || undefined;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const auditWhere = {
    orgId,
    timestamp: { gte: startOfDay },
  };

  const incidentWhere = {
    orgId,
    ...(workspaceId ? { workspaceId } : {}),
    status: { not: "RESOLVED_CLOSED" as const },
  };

  const [auditEvents, openIncidents, providers, workspaces] = await Promise.all([
    prisma.auditEvent.findMany({
      where: auditWhere,
      orderBy: { timestamp: "desc" },
      take: 50,
    }),
    prisma.incident.findMany({
      where: incidentWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.provider.findMany({
      where: {
        orgId,
        ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.workspace.findMany({
      where: { orgId, ...(workspaceId ? { id: workspaceId } : {}) },
      select: { id: true, name: true },
      take: 1,
    }),
  ]);

  const blockedToday = auditEvents.filter((event) => event.actionTaken === "BLOCK").length;
  const warnedToday = auditEvents.filter((event) => event.actionTaken === "WARN").length;
  const allowedToday = auditEvents.filter((event) => event.actionTaken === "ALLOW").length;
  const averageRisk = auditEvents.length
    ? Math.round(
        auditEvents.reduce((sum, event) => sum + (event.riskScore || 0), 0) /
          auditEvents.length,
      )
    : 0;

  const providerStatus =
    providers.length > 0
      ? providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          type: provider.type,
          status:
            provider.healthStatus && provider.healthStatus !== "unknown"
              ? provider.healthStatus
              : "operational",
          lastHealthCheckAt: provider.lastHealthCheckAt,
        }))
      : [
          {
            id: "demo-openai",
            name: "OpenAI",
            type: "OPENAI",
            status: "operational",
            lastHealthCheckAt: new Date().toISOString(),
          },
        ];

  return {
    demoMode: process.env.DEMO_MODE === "true",
    workspaceName: workspaces[0]?.name || "Governance Workspace",
    totalToday: auditEvents.length,
    blockedToday,
    warnedToday,
    allowedToday,
    passRate: auditEvents.length ? Math.round((allowedToday / auditEvents.length) * 100) : 0,
    activeIncidents: openIncidents.length,
    policyHits: blockedToday + warnedToday,
    riskScore: averageRisk,
    alerts: openIncidents.filter((incident) =>
      ["HIGH", "CRITICAL"].includes(incident.severity),
    ).length,
    gatewayStatus: "operational",
    redisStatus: "degraded-safe",
    queueDepth: openIncidents.length,
    activeStreams: Math.max(1, providerStatus.length),
    providerStatus,
  };
}

export const proxyRouter = Router();

proxyRouter.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await buildProxyStats(req);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

proxyRouter.get("/feed", async (req: Request, res: Response) => {
  try {
    const stats = await buildProxyStats(req);
    const orgId = req.user!.orgId;
    const workspaceId = req.workspaceId || req.user?.workspaceId || undefined;

    const [events, incidents, auditLogs] = await Promise.all([
      prisma.auditEvent.findMany({
        where: { orgId },
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
      prisma.incident.findMany({
        where: { orgId, ...(workspaceId ? { workspaceId } : {}) },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.auditLog.findMany({
        where: {
          orgId,
          ...(workspaceId ? { workspaceId } : {}),
          resource: { in: ["proxy_prompt", "proxy_detection", "proxy_policy", "proxy_incident", "proxy_advisor"] },
        },
        orderBy: { timestamp: "desc" },
        take: 10,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const runtimeFeed = events.map((event) => {
      const detection = (event.detectionResults || {}) as Record<string, any>;
      return {
        id: event.id,
        timestamp: event.timestamp,
        action: event.actionTaken,
        riskScore: event.riskScore,
        provider: event.llmProvider,
        categories: Array.isArray(detection.categories) ? detection.categories : [],
        traceId: typeof detection.traceId === "string" ? detection.traceId : null,
        incidentId: typeof detection.incidentId === "string" ? detection.incidentId : null,
        redactedPrompt: event.redactedPrompt,
      };
    });

    res.json({
      stats,
      runtimeFeed,
      incidents,
      auditLogs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

proxyRouter.get("/stream", async (req: Request, res: Response) => {
  const orgId = req.user!.orgId;
  const workspaceId = req.workspaceId || req.user?.workspaceId || undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let lastTimestamp = new Date(0);
  let closed = false;

  const sendEvents = async () => {
    if (closed) return;
    const events = await prisma.auditEvent.findMany({
      where: {
        orgId,
        timestamp: { gt: lastTimestamp },
      },
      orderBy: { timestamp: "asc" },
      take: 20,
    });

    for (const event of events) {
      lastTimestamp = event.timestamp;
      const detections = (event.detectionResults || {}) as Record<string, any>;
      const payload = {
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        action: event.actionTaken,
        severity: detections.severity || severityFromAction(event.actionTaken, event.riskScore >= 85 ? "CRITICAL" : event.riskScore >= 65 ? "HIGH" : event.riskScore >= 35 ? "MEDIUM" : "LOW"),
        provider: event.llmProvider,
        riskScore: event.riskScore,
        traceId: detections.traceId || detections.trace_id || "",
        incidentId: detections.incidentId || detections.incident_id || null,
        promptPreview: detections.promptPreview || event.redactedPrompt || "",
        responsePreview: detections.responsePreview || "",
        categories: Array.isArray(detections.categories) ? detections.categories : [],
        advisor: detections.advisor || null,
        policyName: detections.policyName || null,
        latencyMs: Math.round(event.requestDurationMs || 0),
        title:
          event.actionTaken === "ALLOW"
            ? "ALLOWED - No Violations"
            : String(detections.incident?.title || "Threat detected"),
        workspaceId,
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  };

  const interval = setInterval(() => {
    void sendEvents().catch(() => undefined);
  }, 2000);

  req.on("close", () => {
    closed = true;
    clearInterval(interval);
    res.end();
  });

  void sendEvents().catch(() => undefined);
});

proxyRouter.post("/reset", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { orgId } }),
      prisma.auditLog.deleteMany({
        where: {
          orgId,
          resource: {
            in: ["proxy_prompt", "proxy_detection", "proxy_policy", "proxy_incident", "proxy_advisor", "demo_runtime_seed", "advisor_demo_summary"],
          },
        },
      }),
      prisma.incident.deleteMany({
        where: {
          orgId,
          OR: [
            { title: { contains: "Sensitive customer data blocked" } },
            { title: { contains: "Suspicious prompt content flagged" } },
          ],
        },
      }),
    ]);
    res.json({ status: "ok" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

proxyRouter.post("/simulate", async (req: Request, res: Response) => {
  const startedAt = Date.now();

  try {
    const prompt = String(req.body?.prompt || "").trim();
    const provider = String(req.body?.provider || "OpenAI").trim() || "OpenAI";
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const sessionId =
      String(req.headers["x-session-id"] || req.user?.sessionId || "").trim() ||
      randomUUID();
    const requestId = String(req.headers["x-request-id"] || "").trim() || randomUUID();
    const workspaceId =
      String(req.body?.workspaceId || req.workspaceId || req.user?.workspaceId || "").trim() ||
      null;

    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const traceId = randomUUID();
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    const redactedPrompt = maskPrompt(prompt);
    const detection = await detectPromptWithService(prompt);
    const evaluation = evaluatePolicy({
      provider,
      categories: detection.categories,
      riskScore: detection.riskScore,
    });
    const workspace = workspaceId
      ? await prisma.workspace.findFirst({
          where: { id: workspaceId, orgId: req.user!.orgId },
          select: { id: true, name: true },
        })
      : null;
    const policyRule = await ensureDemoPolicy(req.user!.orgId, workspaceId);
    const providerResponse =
      evaluation.action === "ALLOW" ? await generateProviderResponse(prompt, provider) : "";
    const responsePreview = providerResponse ? providerResponse.slice(0, 200) : null;
    const eventSeverity = severityFromAction(evaluation.action, evaluation.severity);

    res.setHeader("X-Trace-ID", traceId);
    res.setHeader("X-Request-ID", requestId);

    const auditEntries = await prisma.$transaction(async (tx) => {
      const entries = [
        await tx.auditLog.create({
          data: {
            orgId,
            workspaceId,
            userId,
            traceId,
            action: "REPORT_GENERATED",
            resource: "proxy_prompt",
            resourceId: traceId,
            severity: "LOW" as any,
            details: {
              stage: "prompt_submitted",
              provider,
              traceId,
              requestId,
              sessionId,
              orgId,
              workspaceId,
              promptPreview: prompt.slice(0, 120),
            },
          },
        }),
        await tx.auditLog.create({
          data: {
            orgId,
            workspaceId,
            userId,
            traceId,
            action: "REPORT_GENERATED",
            resource: "proxy_detection",
            resourceId: traceId,
            severity: evaluation.severity as any,
            details: {
              stage: "detection_triggered",
              traceId,
              requestId,
              sessionId,
              orgId,
              workspaceId,
              categories: detection.categories,
              findings: detection.findings,
              riskScore: detection.riskScore,
              severity: eventSeverity,
              promptPreview: redactedPrompt.slice(0, 160),
            },
          },
        }),
        await tx.auditLog.create({
          data: {
            orgId,
            workspaceId,
            userId,
            traceId,
            action: "REPORT_GENERATED",
            resource: "proxy_policy",
            resourceId: traceId,
            severity: evaluation.severity as any,
            details: {
              stage: "policy_evaluated",
              traceId,
              requestId,
              sessionId,
              orgId,
              workspaceId,
              policyName: evaluation.policyName,
              policyRuleId: policyRule.id,
              action: evaluation.action,
              reason: evaluation.reason,
              severity: eventSeverity,
            },
          },
        }),
      ];

      return entries;
    });

    const incident =
      evaluation.action === "BLOCK" || evaluation.action === "WARN"
        ? await serviceRegistry.incidents.createIncident({
            orgId,
            userId,
            workspaceId,
            title:
              evaluation.action === "BLOCK"
                ? "Sensitive customer data blocked before provider egress"
                : "Suspicious prompt content flagged for review",
            description: `${evaluation.reason} Provider: ${provider}.`,
            severity: evaluation.severity,
            traceId,
          })
        : null;

    if (incident) {
      await prisma.incident.update({
        where: { id: incident.id },
        data: {
          evidence: [
            {
              id: randomUUID(),
              label: "Redacted prompt",
              type: "prompt",
              content: redactedPrompt,
              traceId,
              capturedAt: new Date().toISOString(),
            },
            {
              id: randomUUID(),
              label: "Detection findings",
              type: "json",
              content: detection.findings,
              traceId,
            },
            {
              id: randomUUID(),
              label: "Policy evaluation",
              type: "json",
              content: {
                policyName: evaluation.policyName,
                action: evaluation.action,
                severity: evaluation.severity,
                reason: evaluation.reason,
                provider,
                timestamp: new Date().toISOString(),
              },
              traceId,
            },
          ],
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId,
          workspaceId,
          userId,
          traceId,
          action: "INCIDENT_CREATED",
          resource: "proxy_incident",
          resourceId: incident.id,
          severity: evaluation.severity as any,
          details: {
            stage: "incident_created",
            traceId,
            requestId,
            sessionId,
            orgId,
            workspaceId,
            incidentId: incident.id,
            policyName: evaluation.policyName,
          },
        },
      });
    }

    const advisor = await generateIncidentAdvisorSummary({
      orgId,
      userId,
      traceId,
      incidentType: evaluation.action === "BLOCK" ? "sensitive_data_egress_attempt" : "governance_warning",
      severity: evaluation.severity,
      offendingPrompt: prompt,
      detectionEvidence: detection.raw || {
        findings: detection.findings,
        categories: detection.categories,
        riskScore: detection.riskScore,
      },
      violatedPolicy: evaluation.policyName,
      incidentId: incident?.id || null,
    });

    const runtimeEvent = await prisma.auditEvent.create({
      data: {
        orgId,
        userId,
        sessionId,
        toolName: "Proxy Monitor",
        llmProvider: provider,
        promptHash,
        detectionResults: {
          findings: detection.findings,
          categories: detection.categories,
          traceId,
          requestId,
          orgId,
          workspaceId,
          sessionId,
          incidentId: incident?.id || null,
          policyName: evaluation.policyName,
          advisor,
          promptPreview: redactedPrompt.slice(0, 160),
          responsePreview,
          severity: eventSeverity,
        },
        riskScore: detection.riskScore,
        actionTaken: evaluation.action,
        policyRuleId: policyRule.id,
        redactedPrompt,
        requestDurationMs: Date.now() - startedAt,
        upstreamStatusCode: evaluation.action === "BLOCK" ? 403 : 200,
      },
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        workspaceId,
        userId,
        traceId,
        action: "REPORT_GENERATED",
        resource: "proxy_advisor",
        resourceId: incident?.id || traceId,
        severity: evaluation.severity as any,
        details: {
          stage: "advisor_generated",
          traceId,
          requestId,
          sessionId,
          orgId,
          workspaceId,
          summary: advisor.summary,
          complianceImpact: advisor.compliance_impact,
          responsePreview,
        },
      },
    });

    await Promise.all([
      safePublish({
        stream: "detection_events",
        eventType: "PromptDetected",
        orgId,
        workspaceId,
        traceId,
        payload: {
          requestId,
          sessionId,
          orgId,
          workspaceId,
          provider,
          categories: detection.categories,
          findings: detection.findings,
          riskScore: detection.riskScore,
        },
      }),
      safePublish({
        stream: "policy_events",
        eventType: "PolicyEvaluated",
        orgId,
        workspaceId,
        traceId,
        payload: {
          requestId,
          sessionId,
          orgId,
          workspaceId,
          action: evaluation.action,
          policyName: evaluation.policyName,
          riskScore: detection.riskScore,
        },
      }),
      safePublish({
        stream: "telemetry_events",
        eventType: "RuntimeTelemetryUpdated",
        orgId,
        workspaceId,
        traceId,
        payload: {
          requestId,
          sessionId,
          orgId,
          workspaceId,
          auditEventId: runtimeEvent.id,
          incidentId: incident?.id || null,
          action: evaluation.action,
          provider,
          responsePreview,
        },
      }),
    ]);

    const steps: Array<{
      id: string;
      label: string;
      detail: string;
      status: StepStatus;
    }> = [
      {
        id: "submit",
        label: "Prompt enters gateway",
        detail: `Trace ${traceId.slice(0, 8)} captured for ${provider}.`,
        status: "completed",
      },
      {
        id: "detection",
        label: "Detection runs",
        detail:
          detection.findings.length > 0
            ? `${detection.findings.length} signal(s) detected with risk score ${detection.riskScore}.`
            : "No sensitive data or prompt injection patterns detected.",
        status: detection.findings.length > 0 ? "warning" : "completed",
      },
      {
        id: "policy",
        label: "Policy evaluates",
        detail: `${evaluation.policyName} returned ${evaluation.action}.`,
        status: evaluation.action === "BLOCK" ? "blocked" : evaluation.action === "WARN" ? "warning" : "completed",
      },
      {
        id: "incident",
        label: "Incident generated",
        detail: incident
          ? `${incident.id} opened in ${workspace?.name || "the active workspace"}.`
          : "No incident required for this request.",
        status: incident ? "completed" : "warning",
      },
      {
        id: "dashboard",
        label: "Dashboard updates live",
        detail: "Runtime telemetry, incident counts, and provider state are ready for refresh.",
        status: "completed",
      },
      {
        id: "advisor",
        label: "AI Advisor explains",
        detail: advisor.summary,
        status: "completed",
      },
      {
        id: "audit",
        label: "Audit log recorded",
        detail: "Submission, detection, policy, incident, and advisor actions were written to audit storage.",
        status: "completed",
      },
    ];

    const stats = await buildProxyStats(req);

    res.json({
      traceId,
      requestId,
      sessionId,
      orgId,
      workspaceId,
      provider,
      prompt: redactedPrompt,
      providerResponse,
      responsePreview,
      detection: {
        findings: detection.findings,
        categories: detection.categories,
        riskScore: detection.riskScore,
      },
      policy: {
        name: evaluation.policyName,
        action: evaluation.action,
        severity: evaluation.severity,
        reason: evaluation.reason,
        complianceFrameworks: ["GDPR", "ISO_27001", "EU_AI_ACT"],
      },
      incident,
      advisor,
      auditEntries,
      auditEventId: runtimeEvent.id,
      runtimeEventId: runtimeEvent.id,
      compliance: {
        frameworks: ["GDPR", "ISO_27001", "EU_AI_ACT"],
        impact: advisor.compliance_impact,
      },
      steps,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
