import { prisma } from "../index";

export async function getAuditLogs(
  orgId: string,
  filters: {
    userId?: string;
    action?: string;
    resource?: string;
    workspaceId?: string;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  },
) {
  const where: Record<string, any> = { orgId };
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.resource) where.resource = filters.resource;
  if (filters.workspaceId) where.workspaceId = filters.workspaceId;
  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) where.timestamp.gte = filters.startDate;
    if (filters.endDate) where.timestamp.lte = filters.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { timestamp: "desc" },
      take: filters.limit || 100,
      skip: filters.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
