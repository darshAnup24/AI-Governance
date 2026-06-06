import { governanceEventBus } from "../../platform/eventBus";
import { prisma } from "../../platform/prisma";

type PolicyInput = {
  orgId: string;
  workspaceId?: string | null;
  environmentId?: string | null;
  name: string;
  description?: string;
  category?: string;
  action?: string;
  conditions?: unknown;
  enabled?: boolean;
  priority?: number;
  actorUserId?: string;
  traceId?: string;
};

export class PolicyService {
  async listForOrg(orgId: string) {
    return prisma.policyRule.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listForInternalFetch(orgId: string) {
    return prisma.policyRule.findMany({
      where: { orgId, enabled: true },
      orderBy: { priority: "asc" },
    });
  }

  async createPolicy(input: PolicyInput) {
    const policy = await prisma.policyRule.create({
      data: {
        orgId: input.orgId,
        workspaceId: input.workspaceId || null,
        environmentId: input.environmentId || null,
        name: input.name,
        description: input.description || "",
        category: input.category || "custom",
        action: input.action || "BLOCK",
        conditions: (input.conditions as any) || [],
        enabled: input.enabled ?? true,
        priority: input.priority || 100,
      },
    });

    await governanceEventBus.publish({
      stream: "policy_events",
      eventType: "PolicyRuleCreated",
      orgId: input.orgId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      traceId: input.traceId,
      payload: {
        policyId: policy.id,
        actorUserId: input.actorUserId || "",
        action: policy.action,
        category: policy.category,
        enabled: policy.enabled,
        priority: policy.priority,
      },
    });

    return policy;
  }

  async bulkCreate(orgId: string, actorUserId: string, items: any[], workspaceId?: string | null) {
    const created = await prisma.policyRule.createMany({
      data: items.map((item) => ({
        orgId,
        workspaceId: workspaceId || null,
        environmentId: item.environmentId || null,
        name: item.name,
        description: item.description || "",
        category: item.category || "CUSTOM",
        action: item.action || "LOG",
        conditions: item.conditions || {},
        enabled: item.enabled ?? true,
        priority: item.priority || 50,
      })),
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        userId: actorUserId,
        action: "POLICY_CREATED",
        resource: "policy",
        details: { bulk: true, count: created.count },
      },
    });

    await governanceEventBus.publish({
      stream: "policy_events",
      eventType: "PolicyBulkImported",
      orgId,
      workspaceId,
      payload: {
        count: created.count,
        actorUserId,
      },
    });

    return created;
  }

  async updatePolicy(id: string, orgId: string, data: Record<string, unknown>, traceId?: string) {
    await prisma.policyRule.updateMany({
      where: { id, orgId },
      data: data as any,
    });
    const updated = await prisma.policyRule.findFirst({ where: { id, orgId } });
    if (updated) {
      await governanceEventBus.publish({
        stream: "policy_events",
        eventType: "PolicyRuleUpdated",
        orgId,
        workspaceId: updated.workspaceId,
        environmentId: updated.environmentId,
        traceId,
        payload: {
          policyId: updated.id,
          enabled: updated.enabled,
          action: updated.action,
          priority: updated.priority,
        },
      });
    }
    return updated;
  }

  async deletePolicy(id: string, orgId: string, traceId?: string) {
    const existing = await prisma.policyRule.findFirst({ where: { id, orgId } });
    await prisma.policyRule.deleteMany({
      where: { id, orgId },
    });
    if (existing) {
      await governanceEventBus.publish({
        stream: "policy_events",
        eventType: "PolicyRuleDeleted",
        orgId,
        workspaceId: existing.workspaceId,
        environmentId: existing.environmentId,
        traceId,
        payload: {
          policyId: existing.id,
          category: existing.category,
        },
      });
    }
    return { deleted: true };
  }
}
