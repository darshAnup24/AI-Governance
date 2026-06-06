import { prisma } from "../../platform/prisma";

function startOfDayWindow() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export class DashboardAnalyticsService {
  async getOverview(orgId: string) {
    const since = startOfDayWindow();

    const [
      workspaces,
      environments,
      models,
      complianceChecks,
      activeIncidents,
      openIncidents,
      policyRules,
      datasetsCount,
      providersCount,
      vendors,
      threatDetections,
      riskAssessments,
      auditEvents24h,
      blockedEvents24h,
      auditEventSamples,
      auditLogs,
      shadowAIAlerts,
      modelVersions,
      reportHistory,
    ] = await Promise.all([
      prisma.workspace.findMany({
        where: { orgId },
        select: { id: true, name: true, type: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.environment.count({ where: { workspace: { orgId } } }),
      prisma.aIModel.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
          purpose: true,
          provider: true,
          riskLevel: true,
          status: true,
          workspace: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.complianceCheck.findMany({
        where: { orgId },
        select: { framework: true, score: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.incident.count({
        where: { orgId, status: { not: "RESOLVED_CLOSED" } },
      }),
      prisma.incident.findMany({
        where: { orgId, status: { not: "RESOLVED_CLOSED" } },
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          updatedAt: true,
          model: { select: { name: true } },
        },
        orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
        take: 6,
      }),
      prisma.policyRule.count({ where: { orgId, enabled: true } }),
      prisma.dataset.count({ where: { orgId } }),
      prisma.provider.count({ where: { orgId } }),
      prisma.vendor.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
          riskLevel: true,
          assessmentScore: true,
          services: true,
          lastAssessed: true,
        },
        orderBy: [{ riskLevel: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.threatDetection.findMany({
        where: { orgId },
        select: {
          id: true,
          patternType: true,
          severity: true,
          status: true,
          detectedAt: true,
          details: true,
        },
        orderBy: { detectedAt: "desc" },
        take: 8,
      }),
      prisma.riskAssessment.findMany({
        where: { model: { orgId } },
        select: {
          overallScore: true,
          createdAt: true,
          euAiActRiskLevel: true,
          model: { select: { id: true, name: true, riskLevel: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.auditEvent.count({
        where: { orgId, timestamp: { gte: since } },
      }),
      prisma.auditEvent.count({
        where: {
          orgId,
          timestamp: { gte: since },
          actionTaken: "BLOCK",
        },
      }),
      prisma.auditEvent.findMany({
        where: { orgId },
        select: {
          id: true,
          timestamp: true,
          actionTaken: true,
          riskScore: true,
          llmProvider: true,
          toolName: true,
          userId: true,
        },
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
      prisma.auditLog.findMany({
        where: { orgId },
        select: {
          id: true,
          action: true,
          resource: true,
          timestamp: true,
          severity: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
      prisma.shadowAIAlert.findMany({
        where: { orgId, isAuthorized: false },
        select: {
          id: true,
          toolName: true,
          domain: true,
          category: true,
          timestamp: true,
        },
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
      prisma.modelVersion.findMany({
        where: { model: { orgId } },
        select: {
          id: true,
          version: true,
          status: true,
          trafficPercentage: true,
          model: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.reportHistory.findMany({
        where: { orgId },
        select: {
          id: true,
          reportType: true,
          format: true,
          generatedAt: true,
          fileUrl: true,
        },
        orderBy: { generatedAt: "desc" },
        take: 6,
      }),
    ]);

    const avgRiskScore =
      riskAssessments.length > 0
        ? Math.round(
            riskAssessments.reduce((sum, risk) => sum + risk.overallScore, 0) /
              riskAssessments.length,
          )
        : 0;

    const complianceScore =
      complianceChecks.length > 0
        ? Math.round(
            complianceChecks.reduce((sum, check) => sum + check.score, 0) /
              complianceChecks.length,
          )
        : 0;

    const riskTrend = riskAssessments
      .slice()
      .reverse()
      .map((risk) => ({
        date: risk.createdAt.toISOString().split("T")[0],
        score: risk.overallScore,
      }));

    const frameworkScores: Record<string, number> = {};
    const frameworkStatuses: Record<string, string> = {};
    for (const check of complianceChecks) {
      frameworkScores[check.framework] = check.score;
      frameworkStatuses[check.framework] = check.status;
    }

    const inventoryByRisk = models.reduce<Record<string, number>>((acc, model) => {
      acc[model.riskLevel] = (acc[model.riskLevel] || 0) + 1;
      return acc;
    }, {});

    const inventoryByStatus = models.reduce<Record<string, number>>((acc, model) => {
      acc[model.status] = (acc[model.status] || 0) + 1;
      return acc;
    }, {});

    const aiAgentsCount = models.filter((model) =>
      /assistant|agent|copilot|bot/i.test(`${model.name} ${model.purpose}`),
    ).length;

    const applicationsCount = new Set(models.map((model) => model.workspace?.name || "Shared")).size;
    const integrationsCount = providersCount + vendors.length;

    const severityCounts = openIncidents.reduce<Record<string, number>>((acc, incident) => {
      acc[incident.severity] = (acc[incident.severity] || 0) + 1;
      return acc;
    }, {});

    const topRiskItems = [
      ...openIncidents.slice(0, 3).map((incident) => ({
        id: incident.id,
        type: "incident",
        title: incident.title,
        level: incident.severity,
        status: incident.status,
        detail: incident.model?.name || "Governance incident",
      })),
      ...vendors
        .filter((vendor) => vendor.riskLevel === "HIGH" || vendor.riskLevel === "UNACCEPTABLE")
        .slice(0, 2)
        .map((vendor) => ({
          id: vendor.id,
          type: "vendor",
          title: vendor.name,
          level: vendor.riskLevel,
          status: vendor.assessmentScore ? `Score ${vendor.assessmentScore}` : "Needs review",
          detail: Array.isArray(vendor.services) ? vendor.services.slice(0, 2).join(", ") : "Vendor service",
        })),
    ];

    const actionItems = [
      complianceScore < 80
        ? {
            id: "compliance-gap",
            title: "Close compliance gaps",
            detail: `${Object.entries(frameworkScores)
              .filter(([, score]) => score < 80)
              .map(([framework]) => framework.replace(/_/g, " "))
              .slice(0, 2)
              .join(", ") || "Review frameworks"} require attention.`,
            tone: "warning",
          }
        : null,
      shadowAIAlerts.length > 0
        ? {
            id: "shadow-ai",
            title: "Investigate unsanctioned AI usage",
            detail: `${shadowAIAlerts.length} unauthorized tools or domains were seen recently.`,
            tone: "danger",
          }
        : null,
      openIncidents.length > 0
        ? {
            id: "incidents",
            title: "Work the active incident queue",
            detail: `${openIncidents.length} incidents remain open across governance workflows.`,
            tone: "default",
          }
        : null,
      policyRules === 0
        ? {
            id: "policies",
            title: "Publish baseline policies",
            detail: "No active policies are enabled for this organization yet.",
            tone: "warning",
          }
        : null,
    ].filter(Boolean);

    return {
      totalModels: models.length,
      activeIncidents,
      avgRiskScore,
      complianceScore,
      policiesActive: policyRules,
      totalVendors: vendors.length,
      auditEvents24h,
      blockedEvents24h,
      threatsTodayCount: threatDetections.filter((item) => item.detectedAt >= since).length,
      shadowAIAlerts: shadowAIAlerts.length,
      canaryVersions: modelVersions.filter((item) => item.status === "CANARY" || item.status === "SHADOW").length,
      riskTrend,
      frameworkScores,
      frameworkStatuses,
      inventory: {
        totalModels: models.length,
        activeVendors: vendors.length,
        connectedDatasets: datasetsCount,
        aiAgents: aiAgentsCount,
        applications: applicationsCount,
        integrations: integrationsCount,
        workspaces: workspaces.length,
        environments,
        byRisk: inventoryByRisk,
        byStatus: inventoryByStatus,
        recentModels: models.slice(0, 6),
      },
      compliance: {
        score: complianceScore,
        frameworks: complianceChecks.map((check) => ({
          framework: check.framework,
          score: check.score,
          status: check.status,
          updatedAt: check.updatedAt,
        })),
      },
      risk: {
        averageScore: avgRiskScore,
        topItems: topRiskItems,
        severityCounts,
        threats: threatDetections,
        shadowAlerts: shadowAIAlerts,
      },
      advisor: {
        actions: actionItems,
      },
      audit: {
        runtimeEvents24h: auditEvents24h,
        blockedEvents24h,
        recentEvents: auditEventSamples,
        recentChanges: auditLogs,
      },
      incidents: {
        openCount: activeIncidents,
        recent: openIncidents,
      },
      reports: {
        recent: reportHistory,
      },
      vendors: {
        top: vendors.slice(0, 5),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
