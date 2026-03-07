import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const datasetsRouter = Router();

// GET /api/datasets
datasetsRouter.get("/", async (req: Request, res: Response) => {
    try {
        const datasets = await prisma.dataset.findMany({
            where: { orgId: req.user!.orgId },
            orderBy: { createdAt: "desc" },
        });
        res.json(datasets);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/datasets
datasetsRouter.post("/", async (req: Request, res: Response) => {
    try {
        const { name, description, sensitivity, recordCount } = req.body;
        const dataset = await prisma.dataset.create({
            data: {
                orgId: req.user!.orgId,
                name,
                description: description || "",
                sensitivity: sensitivity || "INTERNAL",
                recordCount: recordCount || null,
            },
        });
        res.json(dataset);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/datasets/:id
datasetsRouter.delete("/:id", async (req: Request, res: Response) => {
    try {
        await prisma.dataset.deleteMany({
            where: { id: req.params.id, orgId: req.user!.orgId },
        });
        res.json({ deleted: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
