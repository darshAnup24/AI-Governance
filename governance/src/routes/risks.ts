import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const risksRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

// GET /api/risks
risksRouter.get("/", async (req: Request, res: Response) => {
    try {
        const assessments = await prisma.riskAssessment.findMany({
            where: { model: { orgId: req.user!.orgId } },
            include: { model: { select: { name: true, provider: true } } },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        res.json(assessments);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/risks/:modelId
risksRouter.get("/:modelId", async (req: Request, res: Response) => {
    try {
        const assessments = await prisma.riskAssessment.findMany({
            where: { modelId: req.params.modelId, model: { orgId: req.user!.orgId } },
            orderBy: { createdAt: "desc" },
        });
        res.json(assessments);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/risks/analyze — Ollama-powered risk analysis
risksRouter.post("/analyze", async (req: Request, res: Response) => {
    try {
        const { text, modelName } = req.body;
        if (!text) {
            res.status(400).json({ error: "text required for analysis" });
            return;
        }

        const prompt = `You are an AI risk analyst for enterprise AI governance.
Analyze the following text for potential risks. Consider: data privacy, bias, hallucination,
security vulnerabilities, regulatory compliance (EU AI Act, GDPR, HIPAA).

Text: "${text.slice(0, 2000)}"

Provide a JSON response with:
- overall_risk_score (0-100)
- risk_categories: [{category, score, explanation}]
- recommendations: [string]
- eu_ai_act_level: MINIMAL|LIMITED|HIGH|UNACCEPTABLE`;

        const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
        });

        if (!ollamaRes.ok) {
            res.status(502).json({ error: "Ollama unavailable" });
            return;
        }

        const result = (await ollamaRes.json()) as any;
        res.json({ analysis: result.response, model: OLLAMA_MODEL });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
