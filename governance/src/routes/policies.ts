import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const policiesRouter = Router();

// GET /api/policies
policiesRouter.get("/", async (req: Request, res: Response) => {
    try {
        const policies = await prisma.policy.findMany({
            where: { orgId: req.user!.orgId },
            orderBy: { createdAt: "desc" },
        });
        res.json(policies);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/policies
policiesRouter.post("/", async (req: Request, res: Response) => {
    try {
        const { title, content, category, status } = req.body;
        const policy = await prisma.policy.create({
            data: {
                orgId: req.user!.orgId,
                title,
                content: content || "",
                category: category || "general",
                status: status || "DRAFT",
            },
        });
        res.json(policy);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/policies/:id
policiesRouter.put("/:id", async (req: Request, res: Response) => {
    try {
        const { title, content, category, status } = req.body;
        await prisma.policy.updateMany({
            where: { id: req.params.id, orgId: req.user!.orgId },
            data: { title, content, category, status },
        });
        const updated = await prisma.policy.findFirst({ where: { id: req.params.id } });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/policies/:id
policiesRouter.delete("/:id", async (req: Request, res: Response) => {
    try {
        await prisma.policy.deleteMany({
            where: { id: req.params.id, orgId: req.user!.orgId },
        });
        res.json({ deleted: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
