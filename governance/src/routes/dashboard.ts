import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const dashboardRouter = Router();

// GET /api/dashboard/stats
dashboardRouter.get("/stats", async (req: Request, res: Response) => {
    try {
        const orgId = req.user!.orgId;

        const [
            totalModels,
            activeIncidents,
            complianceChecks,
            threatsToday,
            riskAssessments,
            activePolicies,
        ] = await Promise.all([
            prisma.aIModel.count({ where: { orgId } }),
            prisma.incident.count({ where: { orgId, status: { not: "RESOLVED" } } }),
            prisma.complianceCheck.findMany({
                where: { orgId },
                select: { score: true, framework: true },
            }),
            prisma.threatDetection.count({
                where: {
                    orgId,
                    detectedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                },
            }),
            prisma.riskAssessment.findMany({
                where: { model: { orgId } },
                select: { overallScore: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 30,
            }),
            prisma.policyRule.count({ where: { orgId, enabled: true } }),
        ]);

        // Average risk score
        const avgRiskScore =
            riskAssessments.length > 0
                ? Math.round(
                    riskAssessments.reduce((s, r) => s + r.overallScore, 0) /
                    riskAssessments.length
                )
                : 0;

        // Average compliance score
        const complianceScore =
            complianceChecks.length > 0
                ? Math.round(
                    complianceChecks.reduce((s, c) => s + c.score, 0) /
                    complianceChecks.length
                )
                : 0;

        // Risk trend (last 30 assessments)
        const riskTrend = riskAssessments.map((r) => ({
            date: r.createdAt.toISOString().split("T")[0],
            score: r.overallScore,
        }));

        // Compliance by framework
        const frameworkScores: Record<string, number> = {};
        for (const c of complianceChecks) {
            frameworkScores[c.framework] = c.score;
        }

        res.json({
            totalModels,
            activeIncidents,
            avgRiskScore,
            complianceScore,
            threatsTodayCount: threatsToday,
            policiesActive: activePolicies,
            riskTrend,
            frameworkScores,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
