import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const auditRouter = Router();

// GET /api/audit-logs
auditRouter.get("/", async (req: Request, res: Response) => {
    try {
        const { entity, action, limit } = req.query;
        const where: any = { orgId: req.user!.orgId };
        if (entity) where.entity = entity;
        if (action) where.action = action;

        const logs = await prisma.auditLog.findMany({
            where,
            include: { user: { select: { email: true, name: true } } },
            orderBy: { createdAt: "desc" },
            take: Number(limit) || 100,
        });
        res.json(logs);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
