import { prisma } from "../platform/prisma";

export type ReportConfig = {
  format: "pdf" | "json" | "csv";
  type: "compliance" | "audit" | "incident" | "usage";
  framework?: string;
  modelIds?: string[];
  dateRange?: { start: Date; end: Date };
};

export async function generateComplianceReport(
  orgId: string,
  config: ReportConfig,
) {
  const payload = await buildReportPayload(orgId, config);
  if (config.format === "json") {
    return { data: payload };
  }
  if (config.format === "csv") {
    return { csv: toCsv(payload) };
  }
  return { buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8") };
}

async function buildReportPayload(orgId: string, config: ReportConfig) {
  const [organization, models, incidents, checks, auditLogs] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.aIModel.findMany({
      where: {
        orgId,
        ...(config.modelIds?.length ? { id: { in: config.modelIds } } : {}),
      },
    }),
    prisma.incident.findMany({ where: { orgId }, take: 100, orderBy: { createdAt: "desc" } }),
    prisma.complianceCheck.findMany({
      where: { orgId, ...(config.framework ? { framework: config.framework as any } : {}) },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({ where: { orgId }, take: 100, orderBy: { timestamp: "desc" } }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    organization,
    summary: {
      modelCount: models.length,
      incidentCount: incidents.length,
      complianceCount: checks.length,
      auditEntryCount: auditLogs.length,
    },
    config,
    models,
    incidents,
    complianceChecks: checks,
    auditLogs,
  };
}

function toCsv(payload: Record<string, any>) {
  const summary = payload.summary || {};
  return [
    "metric,value",
    `modelCount,${summary.modelCount || 0}`,
    `incidentCount,${summary.incidentCount || 0}`,
    `complianceCount,${summary.complianceCount || 0}`,
    `auditEntryCount,${summary.auditEntryCount || 0}`,
  ].join("\n");
}
