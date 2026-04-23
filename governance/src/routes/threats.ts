import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const threatsRouter = Router();

const DETECTION_URL = process.env.DETECTION_SERVICE_URL || "http://detection:8001";

// GET /api/threats
threatsRouter.get("/", async (req: Request, res: Response) => {
    try {
        const { status, severity, days } = req.query;
        const where: any = { orgId: req.user!.orgId };
        if (status) where.status = status;
        if (severity) where.severity = severity;
        if (days) {
            where.detectedAt = {
                gte: new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000),
            };
        }

        const threats = await prisma.threatDetection.findMany({
            where,
            orderBy: { detectedAt: "desc" },
            take: 100,
        });
        res.json(threats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/threats/scan — Run full detection pipeline on text
threatsRouter.post("/scan", async (req: Request, res: Response) => {
    try {
        const { text } = req.body;
        if (!text) {
            res.status(400).json({ error: "text required" });
            return;
        }

        const detectionRes = await fetch(`${DETECTION_URL}/detect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                user_id: req.user!.userId,
                role: req.user!.role,
                org_id: req.user!.orgId,
            }),
        });

        if (!detectionRes.ok) {
            res.status(502).json({ error: "Detection service error" });
            return;
        }

        const detection = (await detectionRes.json()) as any;

        // Save detected threats
        const savedThreats = [];
        for (const span of detection.detected_spans || []) {
            const threat = await prisma.threatDetection.create({
                data: {
                    orgId: req.user!.orgId,
                    patternType: span.detector || span.category || "UNKNOWN",
                    severity: detection.risk_score >= 80 ? "CRITICAL" : detection.risk_score >= 60 ? "HIGH" : detection.risk_score >= 40 ? "MEDIUM" : "LOW",
                    details: {
                        matchedText: span.matched_text,
                        confidence: span.confidence,
                        context: span.context,
                        category: span.category,
                    },
                    status: "ACTIVE",
                },
            });
            savedThreats.push(threat);
        }

        res.json({
            riskScore: detection.risk_score,
            action: detection.action,
            euAiActRiskLevel: detection.eu_ai_act_risk_level,
            threatsDetected: savedThreats.length,
            threats: savedThreats,
            fullDetection: detection,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
