import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { publishEnrichmentJob } from "../engine/redisEnrichment";

export const risksRouter = Router();

function getModel(): string {
  return process.env.PRIMARY_ADVISOR_MODEL || "llama3-70b-8192";
}

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
            where: { modelId: req.params.modelId as string, model: { orgId: req.user!.orgId } },
            orderBy: { createdAt: "desc" },
        });
        res.json(assessments);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/risks/analyze — Async risk analysis via enrichment queue
risksRouter.post("/analyze", async (req: Request, res: Response) => {
    try {
        const { text, modelName } = req.body;
        if (!text) {
            res.status(400).json({ error: "text required for analysis" });
            return;
        }

        const jobId = await publishEnrichmentJob("risk_analysis", {
            text: text.slice(0, 2000),
            modelName: modelName || "unknown",
        }, req.user!.orgId);

        res.status(202).json({ jobId, status: "queued" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
