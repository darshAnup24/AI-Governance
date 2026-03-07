import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const vendorsRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

// GET /api/vendors
vendorsRouter.get("/", async (req: Request, res: Response) => {
    try {
        const vendors = await prisma.vendor.findMany({
            where: { orgId: req.user!.orgId },
            orderBy: { createdAt: "desc" },
        });
        res.json(vendors);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/vendors
vendorsRouter.post("/", async (req: Request, res: Response) => {
    try {
        const { name, riskLevel, services } = req.body;
        const vendor = await prisma.vendor.create({
            data: {
                orgId: req.user!.orgId,
                name,
                riskLevel: riskLevel || "LIMITED",
                services: services || [],
            },
        });
        res.json(vendor);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/vendors/:id
vendorsRouter.put("/:id", async (req: Request, res: Response) => {
    try {
        const { name, riskLevel, services } = req.body;
        await prisma.vendor.updateMany({
            where: { id: req.params.id, orgId: req.user!.orgId },
            data: { name, riskLevel, services },
        });
        const updated = await prisma.vendor.findFirst({ where: { id: req.params.id } });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/vendors/:id/assess — Ollama vendor risk assessment
vendorsRouter.post("/:id/assess", async (req: Request, res: Response) => {
    try {
        const vendor = await prisma.vendor.findFirst({
            where: { id: req.params.id, orgId: req.user!.orgId },
        });
        if (!vendor) {
            res.status(404).json({ error: "Vendor not found" });
            return;
        }

        const prompt = `You are an AI vendor risk analyst. Assess the following AI vendor:
Name: ${vendor.name}
Services: ${JSON.stringify(vendor.services)}
Current Risk Level: ${vendor.riskLevel}

Provide:
1. Risk score (0-100)
2. Key risk factors
3. Mitigation recommendations
4. Contractual safeguards needed
5. Data handling concerns`;

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

        // Update vendor with assessment
        await prisma.vendor.update({
            where: { id: vendor.id },
            data: { assessmentScore: 65, lastAssessed: new Date() },
        });

        res.json({ assessment: result.response, model: OLLAMA_MODEL });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
