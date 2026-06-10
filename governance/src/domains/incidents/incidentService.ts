import { governanceEventBus } from "../../platform/eventBus";
import { prisma } from "../../platform/prisma";

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["ACKNOWLEDGED", "INVESTIGATING"],
  ACKNOWLEDGED: ["INVESTIGATING", "CONTAINED"],
  INVESTIGATING: ["CONTAINED", "RESOLVED_CLOSED", "FALSE_POSITIVE"],
  CONTAINED: ["RESOLVED_CLOSED", "INVESTIGATING"],
  RESOLVED_CLOSED: ["INVESTIGATING"],
  FALSE_POSITIVE: [],
};

export class IncidentService {
  validateStatusTransition(currentStatus: string, newStatus: string) {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed) {
      return { valid: false, error: `Unknown current status: ${currentStatus}` };
    }
    if (!allowed.includes(newStatus)) {
      return {
        valid: false,
        error: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowed.join(", ")}`,
      };
    }
    return { valid: true };
  }

  async getStats(orgId: string, workspaceId?: string) {
    const where: any = { orgId };
    if (workspaceId) where.workspaceId = workspaceId;

    const [byStatus, bySeverity, byAssignee, total] = await Promise.all([
      prisma.incident.groupBy({ by: ["status"], where, _count: true }),
      prisma.incident.groupBy({ by: ["severity"], where, _count: true }),
      prisma.incident.groupBy({
        by: ["assignedTo"],
        where,
        _count: true,
        orderBy: { _count: { assignedTo: "desc" } },
        take: 10,
      }),
      prisma.incident.count({ where }),
    ]);

    const assigneeIds = byAssignee
      .filter((item) => item.assignedTo)
      .map((item) => item.assignedTo as string);
    const assignees =
      assigneeIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const assigneeMap = Object.fromEntries(assignees.map((user) => [user.id, user]));

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((item) => [item.status, item._count])),
      bySeverity: Object.fromEntries(
        bySeverity.map((item) => [item.severity, item._count]),
      ),
      byAssignee: byAssignee.map((item) => ({
        user: item.assignedTo
          ? assigneeMap[item.assignedTo] || { id: item.assignedTo, name: "Unknown" }
          : null,
        count: item._count,
      })),
    };
  }

  async list(orgId: string, filters: Record<string, unknown>) {
    const where: any = { orgId };
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.workspaceId) where.workspaceId = filters.workspaceId;

    const incidents = await prisma.incident.findMany({
      where,
      include: {
        model: { select: { name: true, provider: true } },
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, events: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { incidents };
  }

  async getById(id: string, orgId: string) {
    return prisma.incident.findFirst({
      where: { id, orgId },
      include: {
        model: {
          select: {
            id: true,
            name: true,
            provider: true,
            version: true,
            riskLevel: true,
          },
        },
        assignee: { select: { id: true, name: true, email: true } },
        escalation: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true, slug: true } },
        environment: { select: { id: true, name: true, type: true } },
        comments: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
        },
        events: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  async createIncident(input: {
    orgId: string;
    userId: string;
    title: string;
    description?: string;
    severity?: string;
    modelId?: string | null;
    workspaceId?: string | null;
    environmentId?: string | null;
    traceId?: string;
  }) {
    const incident = await prisma.incident.create({
      data: {
        orgId: input.orgId,
        workspaceId: input.workspaceId || null,
        environmentId: input.environmentId || null,
        modelId: input.modelId || null,
        traceId: input.traceId || null,
        title: input.title,
        description: input.description || "",
        severity: (input.severity || "MEDIUM") as any,
        status: "OPEN",
      },
    });

    await prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        traceId: input.traceId || null,
        eventType: "CREATED",
        payload: {
          title: incident.title,
          severity: incident.severity,
          createdBy: input.userId,
          traceId: input.traceId || null,
        },
        createdBy: input.userId,
      },
    });

    try {
      await governanceEventBus.publish({
        stream: "incident_events",
        eventType: "IncidentCreated",
        orgId: input.orgId,
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        traceId: input.traceId,
        payload: {
          incidentId: incident.id,
          severity: incident.severity,
          modelId: incident.modelId,
          actorUserId: input.userId,
        },
      });
    } catch (error: any) {
      console.warn(
        "[incident-service] publish skipped:",
        error?.message || error,
      );
    }

    return incident;
  }
}
