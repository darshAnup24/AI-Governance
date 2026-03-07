import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const complianceRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

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

// POST /api/compliance/gap-analysis/:modelId — Ollama-powered gap analysis
complianceRouter.post("/gap-analysis/:modelId", async (req: Request, res: Response) => {
    try {
        const checks = await prisma.complianceCheck.findMany({
            where: { model: { id: req.params.modelId, orgId: req.user!.orgId } },
            include: { model: true },
        });

        const model = await prisma.aIModel.findFirst({
            where: { id: req.params.modelId, orgId: req.user!.orgId },
        });

        const prompt = `You are an AI compliance expert. Analyze the following AI model and its compliance status:

Model: ${model?.name || "Unknown"} (${model?.provider || "Unknown"}, ${model?.purpose || "General"})
Risk Level: ${model?.riskLevel || "UNKNOWN"}

Compliance checks completed:
${checks.map((c) => `- ${c.framework}: ${c.score}% (${c.status})`).join("\n")}

Provide a detailed gap analysis with:
1. Key compliance gaps by framework
2. Priority remediation steps (numbered)
3. Estimated effort for each step
4. Risk of non-compliance for each gap

Be specific and cite regulation articles where applicable.`;

        const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
        });

        if (!ollamaRes.ok) {
            res.status(502).json({ error: "Ollama unavailable for gap analysis" });
            return;
        }

        const result = (await ollamaRes.json()) as any;
        res.json({ gapAnalysis: result.response, model: OLLAMA_MODEL });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
