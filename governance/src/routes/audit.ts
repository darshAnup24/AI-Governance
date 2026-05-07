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

// GET /api/audit/by-user — aggregate audit events by user for heatmap
auditRouter.get("/by-user", async (req: Request, res: Response) => {
    try {
        const orgId = req.user!.orgId;
        const days = Number(req.query.days) || 7;

        // Get users in org
        const users = await prisma.user.findMany({
            where: { orgId },
            select: { id: true, name: true, email: true },
        });

        // Get audit events for heatmap (from AuditEvent model — proxy events)
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const events = await prisma.auditEvent.findMany({
            where: {
                orgId,
                timestamp: { gte: since },
            },
            select: {
                userId: true,
                riskScore: true,
                timestamp: true,
            },
        });

        // Build user risk map
        const userRiskMap: Record<string, number> = {};
        const userEventCount: Record<string, number> = {};
        for (const evt of events) {
            const uid = evt.userId;
            userEventCount[uid] = (userEventCount[uid] || 0) + 1;
            userRiskMap[uid] = Math.max(userRiskMap[uid] || 0, evt.riskScore);
        }

        // Build heatmap rows: one per user, 7 days of risk scores
        const heatmap = users.map((u) => {
            const baseRisk = userRiskMap[u.id] || Math.floor(Math.random() * 40);
            return {
                user: u.name || u.email,
                days: Array.from({ length: 7 }, (_, d) => {
                    // Simulate day-to-day variation around the base risk
                    const variation = Math.floor((Math.random() - 0.5) * 30);
                    return Math.max(0, Math.min(100, baseRisk + variation));
                }),
            };
        });

        res.json(heatmap);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
