import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const policiesRouter = Router();

// GET /api/policies
policiesRouter.get("/", async (req: Request, res: Response) => {
    try {
        const policies = await prisma.policyRule.findMany({
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
        // Map old dashboard fields if present to new PolicyRule fields, or accept direct new fields
        const name = req.body.name || req.body.title || "Untitled Rule";
        const description = req.body.description || req.body.content || "";
        const conditions = req.body.conditions || [];
        const action = req.body.action || "BLOCK";
        const priority = req.body.priority || 100;
        const enabled = req.body.enabled !== undefined ? req.body.enabled : true;

        const policy = await prisma.policyRule.create({
            data: {
                orgId: req.user!.orgId,
                name,
                description,
                conditions,
                action,
                priority,
                enabled,
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
        const name = req.body.name || req.body.title;
        const description = req.body.description || req.body.content;
        const conditions = req.body.conditions;
        const action = req.body.action;
        const priority = req.body.priority;
        const enabled = req.body.enabled;

        const data: any = {};
        if (name !== undefined) data.name = name;
        if (description !== undefined) data.description = description;
        if (conditions !== undefined) data.conditions = conditions;
        if (action !== undefined) data.action = action;
        if (priority !== undefined) data.priority = priority;
        if (enabled !== undefined) data.enabled = enabled;

        await prisma.policyRule.updateMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            data,
        });
        const updated = await prisma.policyRule.findFirst({ where: { id: req.params.id as string } });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/policies/:id
policiesRouter.delete("/:id", async (req: Request, res: Response) => {
    try {
        await prisma.policyRule.deleteMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        res.json({ deleted: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
