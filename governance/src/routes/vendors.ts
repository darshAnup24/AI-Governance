import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { publishEnrichmentJob } from "../engine/redisEnrichment";

export const vendorsRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434";

function getModel(): string {
  return process.env.PRIMARY_ADVISOR_MODEL || "llama3.2:3b";
}

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
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            data: { name, riskLevel, services },
        });
        const updated = await prisma.vendor.findFirst({ where: { id: req.params.id as string } });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/vendors/:id/assess — Async vendor risk assessment via enrichment queue
vendorsRouter.post("/:id/assess", async (req: Request, res: Response) => {
    try {
        const vendor = await prisma.vendor.findFirst({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        if (!vendor) {
            res.status(404).json({ error: "Vendor not found" });
            return;
        }

        const jobId = await publishEnrichmentJob("vendor_assessment", {
            vendorId: vendor.id,
            vendorName: vendor.name,
            services: vendor.services,
            riskLevel: vendor.riskLevel,
        }, req.user!.orgId);

        res.status(202).json({ jobId, status: "queued" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
