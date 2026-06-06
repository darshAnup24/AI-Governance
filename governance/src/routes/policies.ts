import { Router, Request, Response } from "express";
import { serviceRegistry } from "../platform/serviceRegistry";

export const policiesRouter = Router();

// GET /api/policies
policiesRouter.get("/", async (req: Request, res: Response) => {
    try {
        const policies = await serviceRegistry.policies.listForOrg(req.user!.orgId);
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

        const policy = await serviceRegistry.policies.createPolicy({
            orgId: req.user!.orgId,
            workspaceId: req.workspaceId || null,
            environmentId: req.environmentId || null,
            name,
            description,
            conditions,
            action,
            priority,
            enabled,
            actorUserId: req.user!.userId,
        });
        res.json(policy);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/policies/bulk — Create multiple policies from templates
policiesRouter.post('/bulk', async (req: Request, res: Response) => {
    try {
        const { policies, workspaceId } = req.body;
        if (!Array.isArray(policies) || policies.length === 0) {
            res.status(400).json({ error: 'policies array is required' });
            return;
        }

        if (policies.length > 100) {
            res.status(400).json({ error: 'Maximum 100 policies per batch' });
            return;
        }

        const created = await serviceRegistry.policies.bulkCreate(
            req.user!.orgId,
            req.user!.userId,
            policies,
            workspaceId || null,
        );

        res.status(201).json({ created: created.count });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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

        const updated = await serviceRegistry.policies.updatePolicy(
            req.params.id as string,
            req.user!.orgId,
            data,
        );
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/policies/:id
policiesRouter.delete("/:id", async (req: Request, res: Response) => {
    try {
        const result = await serviceRegistry.policies.deletePolicy(
            req.params.id as string,
            req.user!.orgId,
        );
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
