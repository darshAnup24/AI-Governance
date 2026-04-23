import { Router, Request, Response } from "express";
import { prisma } from "../index";

export const modelsRouter = Router();

const DETECTION_URL = process.env.DETECTION_SERVICE_URL || "http://detection:8001";

// GET /api/models
modelsRouter.get("/", async (req: Request, res: Response) => {
    try {
        const models = await prisma.aIModel.findMany({
            where: { orgId: req.user!.orgId },
            include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
        });
        res.json(models);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/models
modelsRouter.post("/", async (req: Request, res: Response) => {
    try {
        const { name, provider, version, purpose, riskLevel } = req.body;
        const model = await prisma.aIModel.create({
            data: {
                orgId: req.user!.orgId,
                name,
                provider: provider || "unknown",
                version: version || "1.0",
                purpose: purpose || "",
                riskLevel: riskLevel || "LIMITED",
            },
        });
        res.json(model);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/models/:id
modelsRouter.get("/:id", async (req: Request, res: Response) => {
    try {
        const model = await prisma.aIModel.findFirst({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            include: {
                riskAssessments: { orderBy: { createdAt: "desc" } },
                incidents: { orderBy: { createdAt: "desc" }, take: 5 },
                complianceChecks: true,
            },
        });
        if (!model) {
            res.status(404).json({ error: "Model not found" });
            return;
        }
        res.json(model);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/models/:id
modelsRouter.put("/:id", async (req: Request, res: Response) => {
    try {
        const { name, provider, version, purpose, riskLevel, status } = req.body;
        const model = await prisma.aIModel.updateMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            data: { name, provider, version, purpose, riskLevel, status },
        });
        res.json(model);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/models/:id
modelsRouter.delete("/:id", async (req: Request, res: Response) => {
    try {
        await prisma.aIModel.deleteMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        res.json({ deleted: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/models/:id/scan — Call detection service and save RiskAssessment
modelsRouter.post("/:id/scan", async (req: Request, res: Response) => {
    try {
        const model = await prisma.aIModel.findFirst({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        if (!model) {
            res.status(404).json({ error: "Model not found" });
            return;
        }

        // Build sample text from model metadata for detection
        const sampleText =
            req.body.text ||
            `AI Model: ${model.name}, Provider: ${model.provider}, Purpose: ${model.purpose}. ` +
            `This model is used for ${model.purpose} and operates at risk level ${model.riskLevel}.`;

        // Call the detection service
        const detectionRes = await fetch(`${DETECTION_URL}/detect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: sampleText,
                user_id: req.user!.userId,
                role: req.user!.role,
                org_id: req.user!.orgId,
            }),
        });

        if (!detectionRes.ok) {
            const err = await detectionRes.text();
            res.status(502).json({ error: "Detection service error", detail: err });
            return;
        }

        const detection = (await detectionRes.json()) as any;

        // Save RiskAssessment
        const assessment = await prisma.riskAssessment.create({
            data: {
                modelId: model.id,
                overallScore: detection.risk_score,
                categoryBreakdown: detection.detection_results || {},
                findings: detection.detected_spans || [],
                recommendations: detection.remediation_priority || [],
                euAiActRiskLevel: detection.eu_ai_act_risk_level || "MINIMAL",
                regulatoryFlags: detection.regulatory_flags || [],
            },
        });

        // Update model risk level based on score
        let newRiskLevel = model.riskLevel;
        if (detection.risk_score >= 90) newRiskLevel = "UNACCEPTABLE";
        else if (detection.risk_score >= 70) newRiskLevel = "HIGH";
        else if (detection.risk_score >= 40) newRiskLevel = "LIMITED";
        else newRiskLevel = "MINIMAL";

        await prisma.aIModel.update({
            where: { id: model.id },
            data: { riskLevel: newRiskLevel as any },
        });

        // Auto-create incident for HIGH/UNACCEPTABLE
        if (detection.risk_score >= 70) {
            await prisma.incident.create({
                data: {
                    orgId: req.user!.orgId,
                    modelId: model.id,
                    title: `High risk detected in ${model.name}`,
                    description: `Automated scan found risk score ${detection.risk_score}. EU AI Act level: ${detection.eu_ai_act_risk_level}.`,
                    severity: detection.risk_score >= 90 ? "CRITICAL" : "HIGH",
                    status: "OPEN",
                },
            });
        }

        res.json({ assessment, detection });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
