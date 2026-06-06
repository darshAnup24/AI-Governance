import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { publishEnrichmentJob } from "../engine/redisEnrichment";

export const complianceRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
const PRIMARY_ADVISOR_MODEL = process.env.PRIMARY_ADVISOR_MODEL || "llama3.2:3b";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "tinyllama";

function getModel(): string {
  return PRIMARY_ADVISOR_MODEL;
}

const FRAMEWORK_QUESTIONS: Record<string, string[]> = {
    EU_AI_ACT: [
        "Is the AI system classified by its risk category (minimal/limited/high/unacceptable)?",
        "Is there a human oversight mechanism in place?",
        "Has a conformity assessment been conducted?",
        "Is there transparency documentation for end users?",
        "Are data governance measures documented?",
        "Is there a risk management system in place?",
        "Are accuracy, robustness, and cybersecurity requirements met?",
        "Is there a post-market monitoring plan?",
    ],
    ISO_42001: [
        "Is there an AI management system policy?",
        "Are AI-related risks and opportunities identified?",
        "Are competence requirements for AI personnel defined?",
        "Is there a documented AI development lifecycle?",
        "Are third-party AI components managed?",
        "Is there continuous monitoring and improvement?",
    ],
    NIST_AI_RMF: [
        "Are AI risks mapped and categorized?",
        "Is there a measurement plan for AI system performance?",
        "Are governance structures defined?",
        "Is there stakeholder engagement in risk management?",
        "Are AI systems tested for bias and fairness?",
        "Is there transparency in AI decision-making?",
    ],
    ISO_27001: [
        "Is there an information security management system (ISMS)?",
        "Are access controls implemented for AI systems?",
        "Is data encryption applied for AI data at rest and in transit?",
        "Are security incident response procedures defined?",
        "Is there a business continuity plan for AI services?",
        "Are third-party security assessments conducted?",
    ],
};

// GET /api/compliance/frameworks
complianceRouter.get("/frameworks", (_req: Request, res: Response) => {
    const frameworks = Object.entries(FRAMEWORK_QUESTIONS).map(([key, questions]) => ({
        id: key,
        name: key.replace(/_/g, " "),
        questionCount: questions.length,
        questions,
    }));
    res.json(frameworks);
});

// POST /api/compliance/checks
complianceRouter.post("/checks", async (req: Request, res: Response) => {
    try {
        const { framework, modelId, answers } = req.body;
        if (!framework) {
            res.status(400).json({ error: "framework required" });
            return;
        }

        const questions = FRAMEWORK_QUESTIONS[framework] || [];
        const answerList = answers || [];
        const answeredCount = answerList.filter((a: any) => a.status === "compliant").length;
        const score = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

        let status = "NOT_STARTED";
        if (score >= 90) status = "COMPLIANT";
        else if (score >= 50) status = "PARTIALLY_COMPLIANT";
        else if (answerList.length > 0) status = "IN_PROGRESS";

        const check = await prisma.complianceCheck.create({
            data: {
                orgId: req.user!.orgId,
                modelId: modelId || null,
                framework: framework as any,
                status: status as any,
                answers: answerList,
                score,
            },
        });
        res.json(check);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/compliance/checks/:orgId
complianceRouter.get("/checks/:orgId", async (req: Request, res: Response) => {
    try {
        const checks = await prisma.complianceCheck.findMany({
            where: { orgId: req.user!.orgId },
            include: { model: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(checks);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/compliance/checks/org — alias for frontend convenience
complianceRouter.get("/checks/org", async (req: Request, res: Response) => {
    try {
        const checks = await prisma.complianceCheck.findMany({
            where: { orgId: req.user!.orgId },
            include: { model: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(checks);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/compliance/gap-analysis/:modelId — Async gap analysis via enrichment queue
complianceRouter.post("/gap-analysis/:modelId", async (req: Request, res: Response) => {
    try {
        const checks = await prisma.complianceCheck.findMany({
            where: { model: { id: req.params.modelId as string, orgId: req.user!.orgId } },
            include: { model: true },
        });

        const model = await prisma.aIModel.findFirst({
            where: { id: req.params.modelId as string, orgId: req.user!.orgId },
        });

        const jobId = await publishEnrichmentJob("compliance_gap", {
            modelId: req.params.modelId,
            modelName: model?.name || "Unknown",
            modelProvider: model?.provider || "Unknown",
            modelRiskLevel: model?.riskLevel || "UNKNOWN",
            checks: checks.map((c) => ({
                framework: c.framework,
                score: c.score,
                status: c.status,
            })),
            type: "single",
        }, req.user!.orgId);

        res.status(202).json({ jobId, status: "queued" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/compliance/gap-analysis/all — Async org-wide gap analysis via enrichment queue
complianceRouter.post("/gap-analysis/all", async (req: Request, res: Response) => {
    try {
        const [checks, models] = await Promise.all([
            prisma.complianceCheck.findMany({ where: { orgId: req.user!.orgId } }),
            prisma.aIModel.findMany({ where: { orgId: req.user!.orgId }, take: 10 }),
        ]);

        const jobId = await publishEnrichmentJob("compliance_gap", {
            models: models.map((m) => ({
                id: m.id,
                name: m.name,
                provider: m.provider,
                riskLevel: m.riskLevel,
            })),
            checks: checks.map((c) => ({
                framework: c.framework,
                score: c.score,
                status: c.status,
            })),
            type: "all",
        }, req.user!.orgId);

        res.status(202).json({ jobId, status: "queued" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
