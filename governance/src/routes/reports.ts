import { Router, Request, Response } from "express";
import { prisma } from "../index";
import PDFDocument from "pdfkit";

export const reportsRouter = Router();

// POST /api/reports/generate
reportsRouter.post("/generate", async (req: Request, res: Response) => {
    try {
        const { framework, dateRange, modelIds, format } = req.body;
        const orgId = req.user!.orgId;

        // Fetch data for report
        const [org, models, incidents, complianceChecks, threats, riskAssessments] =
            await Promise.all([
                prisma.organization.findUnique({ where: { id: orgId } }),
                prisma.aIModel.findMany({
                    where: {
                        orgId,
                        ...(modelIds?.length ? { id: { in: modelIds } } : {}),
                    },
                    include: {
                        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
                    },
                }),
                prisma.incident.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 20 }),
                prisma.complianceCheck.findMany({
                    where: { orgId, ...(framework ? { framework: framework as any } : {}) },
                }),
                prisma.threatDetection.findMany({
                    where: { orgId },
                    orderBy: { detectedAt: "desc" },
                    take: 50,
                }),
                prisma.riskAssessment.findMany({
                    where: { model: { orgId } },
                    include: { model: { select: { name: true } } },
                    orderBy: { createdAt: "desc" },
                    take: 20,
                }),
            ]);

        if (format === "json") {
            res.json({
                organization: org?.name,
                generatedAt: new Date().toISOString(),
                summary: {
                    totalModels: models.length,
                    activeIncidents: incidents.filter((i) => i.status !== "RESOLVED").length,
                    avgComplianceScore:
                        complianceChecks.length > 0
                            ? Math.round(complianceChecks.reduce((s, c) => s + c.score, 0) / complianceChecks.length)
                            : 0,
                    threatsDetected: threats.length,
                },
                models: models.map((m) => ({
                    name: m.name,
                    provider: m.provider,
                    riskLevel: m.riskLevel,
                    lastScore: m.riskAssessments[0]?.overallScore || null,
                })),
                incidents: incidents.map((i) => ({
                    title: i.title,
                    severity: i.severity,
                    status: i.status,
                    createdAt: i.createdAt,
                })),
                compliance: complianceChecks.map((c) => ({
                    framework: c.framework,
                    score: c.score,
                    status: c.status,
                })),
            });
            return;
        }

        if (format === "csv") {
            const rows = [
                "Model,Provider,Risk Level,Last Score,Status",
                ...models.map(
                    (m) =>
                        `"${m.name}","${m.provider}","${m.riskLevel}","${m.riskAssessments[0]?.overallScore || "N/A"}","${m.status}"`
                ),
            ];
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename=shieldai-report-${Date.now()}.csv`);
            res.send(rows.join("\n"));
            return;
        }

        // Default: PDF
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=shieldai-report-${Date.now()}.pdf`);
        doc.pipe(res);

        // Title
        doc.fontSize(24).text("ShieldAI Governance Report", { align: "center" });
        doc.moveDown();
        doc.fontSize(12).fillColor("#666").text(`Organization: ${org?.name || "Unknown"}`, { align: "center" });
        doc.text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
        doc.moveDown(2);

        // Executive Summary
        doc.fontSize(16).fillColor("#000").text("Executive Summary");
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor("#333");
        doc.text(`• Total AI Models: ${models.length}`);
        doc.text(`• Active Incidents: ${incidents.filter((i) => i.status !== "RESOLVED").length}`);
        doc.text(`• Threats Detected: ${threats.length}`);
        const avgScore =
            complianceChecks.length > 0
                ? Math.round(complianceChecks.reduce((s, c) => s + c.score, 0) / complianceChecks.length)
                : 0;
        doc.text(`• Average Compliance Score: ${avgScore}%`);
        doc.moveDown();

        // Model Inventory
        doc.fontSize(16).fillColor("#000").text("AI Model Inventory");
        doc.moveDown(0.5);
        for (const m of models) {
            doc.fontSize(11).fillColor("#333");
            doc.text(
                `${m.name} (${m.provider}) — Risk: ${m.riskLevel}, Score: ${m.riskAssessments[0]?.overallScore ?? "N/A"}`
            );
        }
        doc.moveDown();

        // Compliance
        doc.fontSize(16).fillColor("#000").text("Compliance Status");
        doc.moveDown(0.5);
        for (const c of complianceChecks) {
            doc.fontSize(11).fillColor("#333");
            doc.text(`${c.framework}: ${c.score}% (${c.status})`);
        }
        doc.moveDown();

        // Incidents
        doc.fontSize(16).fillColor("#000").text("Recent Incidents");
        doc.moveDown(0.5);
        for (const i of incidents.slice(0, 10)) {
            doc.fontSize(11).fillColor("#333");
            doc.text(`[${i.severity}] ${i.title} — ${i.status}`);
        }

        doc.end();
    } catch (err: any) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});
