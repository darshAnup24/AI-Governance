import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const incidentsRouter = Router();

// GET /api/incidents
incidentsRouter.get("/", async (req: Request, res: Response) => {
    try {
        const { status, severity } = req.query;
        const where: any = { orgId: req.user!.orgId };
        if (status) where.status = status;
        if (severity) where.severity = severity;

        const incidents = await prisma.incident.findMany({
            where,
            include: { model: { select: { name: true, provider: true } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(incidents);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/incidents
incidentsRouter.post("/", async (req: Request, res: Response) => {
    try {
        const { title, description, severity, modelId } = req.body;
        const incident = await prisma.incident.create({
            data: {
                orgId: req.user!.orgId,
                modelId: modelId || null,
                title,
                description: description || "",
                severity: severity || "MEDIUM",
                status: "OPEN",
            },
        });
        res.json(incident);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/incidents/:id
incidentsRouter.put("/:id", async (req: Request, res: Response) => {
    try {
        const { title, description, severity, status } = req.body;
        const data: any = { title, description, severity, status };
        if (status === "RESOLVED") data.resolvedAt = new Date();

        const incident = await prisma.incident.updateMany({
            where: { id: req.params.id, orgId: req.user!.orgId },
            data,
        });
        res.json(incident);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/incidents/:id/status
incidentsRouter.patch("/:id/status", async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
        const data: any = { status };
        if (status === "RESOLVED") data.resolvedAt = new Date();

        await prisma.incident.updateMany({
            where: { id: req.params.id, orgId: req.user!.orgId },
            data,
        });

        const updated = await prisma.incident.findFirst({
            where: { id: req.params.id },
            include: { model: { select: { name: true } } },
        });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
