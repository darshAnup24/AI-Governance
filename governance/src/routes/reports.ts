import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { generateComplianceReport, ReportConfig } from "../engine/reportGenerator";
import { serviceRegistry } from "../platform/serviceRegistry";

export const reportsRouter = Router();

reportsRouter.post("/generate", async (req: Request, res: Response) => {
  try {
    const {
      format = "pdf",
      framework,
      dateRange,
      modelIds,
      type = "compliance",
    } = req.body;

    const orgId = req.user!.orgId;

    const config: ReportConfig = {
      format: format as "pdf" | "json" | "csv",
      type: type as any,
      framework,
      modelIds,
      dateRange: dateRange
        ? {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          }
        : undefined,
    };

    const result = await generateComplianceReport(orgId, config);

    if (result.data) {
      res.json(result.data);
      await prisma.reportHistory.create({
        data: {
          orgId,
          reportType: type,
          format: format.toUpperCase() as any,
          fileUrl: `generated/report-${Date.now()}.json`,
          parameters: config as any,
          generatedBy: req.user!.userId,
        },
      });
      return;
    }

    if (result.csv) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=airlock-${type}-${Date.now()}.csv`);
      res.send(result.csv);
      return;
    }

    if (result.buffer) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=airlock-${type}-${Date.now()}.pdf`);
      res.send(result.buffer);
      return;
    }

    res.status(500).json({ error: "Report generation failed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.post("/generate-async", async (req: Request, res: Response) => {
  try {
    const {
      format = "pdf",
      framework,
      dateRange,
      modelIds,
      type = "compliance",
    } = req.body;

    const job = await serviceRegistry.reports.enqueueReport({
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      traceId: req.headers["x-trace-id"] as string | undefined,
      format: format as "pdf" | "json" | "csv",
      type: type as "compliance" | "audit" | "incident" | "usage",
      framework,
      modelIds,
      dateRange: dateRange
        ? {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
          }
        : undefined,
    });

    res.status(202).json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get("/jobs/:jobId", async (req: Request, res: Response) => {
  try {
    const status = await serviceRegistry.reports.getJobStatus(req.params.jobId as string);
    if (!status) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const reports = await prisma.reportHistory.findMany({
      where: { orgId },
      orderBy: { generatedAt: "desc" },
      take: 50,
    });
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
