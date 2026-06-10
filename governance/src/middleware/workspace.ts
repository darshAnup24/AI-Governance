import { NextFunction, Request, Response } from "express";

import { prisma } from "../index";

export class TenantScopeError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "TenantScopeError";
    this.statusCode = statusCode;
  }
}

export function workspaceContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const workspaceId =
    (req.headers["x-workspace-id"] as string) ||
    (req.query.workspaceId as string) ||
    req.user?.workspaceId;
  const environmentId =
    (req.headers["x-environment-id"] as string) ||
    (req.query.environmentId as string) ||
    req.user?.environmentId;

  if (workspaceId) req.workspaceId = workspaceId;
  if (environmentId) req.environmentId = environmentId;
  next();
}

export async function validateWorkspaceAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (req.workspaceId) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.userId,
        workspaceId: req.workspaceId,
      },
      include: {
        workspace: {
          include: { environments: true },
        },
      },
    });
    if (!membership) {
      res.status(403).json({ error: "Not a member of this workspace" });
      return;
    }
    req.workspaceRole = membership.role;

    if (req.environmentId) {
      const environment = membership.workspace.environments.find(
        (candidate) => candidate.id === req.environmentId,
      );
      if (!environment) {
        res.status(403).json({ error: "Environment does not belong to workspace" });
        return;
      }
    }
  } else if (req.environmentId) {
    const environment = await prisma.environment.findFirst({
      where: { id: req.environmentId },
      include: { workspace: true },
    });
    if (!environment) {
      res.status(404).json({ error: "Environment not found" });
      return;
    }
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.userId, workspaceId: environment.workspaceId },
    });
    if (!membership) {
      res.status(403).json({ error: "Not a member of the environment workspace" });
      return;
    }
    req.workspaceId = environment.workspaceId;
    req.workspaceRole = membership.role;
  }

  next();
}

export async function resolveScopedTenantContext(
  req: Request,
  input: {
    workspaceId?: string | null;
    environmentId?: string | null;
    requireMembership?: boolean;
  },
) {
  if (!req.user) {
    throw new TenantScopeError(401, "Authentication required");
  }

  const requireMembership = input.requireMembership !== false;
  let workspaceId = input.workspaceId || null;
  let environmentId = input.environmentId || null;

  if (workspaceId) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, orgId: req.user.orgId },
      select: { id: true },
    });
    if (!workspace) {
      throw new TenantScopeError(404, "Workspace not found in your organization");
    }
    if (requireMembership && !req.user.workspaceIds.includes(workspaceId)) {
      throw new TenantScopeError(403, "Not authorized for this workspace");
    }
  }

  if (environmentId) {
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        workspace: {
          orgId: req.user.orgId,
        },
      },
      select: { id: true, workspaceId: true },
    });
    if (!environment) {
      throw new TenantScopeError(404, "Environment not found in your organization");
    }
    if (workspaceId && environment.workspaceId !== workspaceId) {
      throw new TenantScopeError(
        403,
        "Environment does not belong to the requested workspace",
      );
    }
    workspaceId = workspaceId || environment.workspaceId;
    if (requireMembership && !req.user.workspaceIds.includes(environment.workspaceId)) {
      throw new TenantScopeError(403, "Not authorized for this environment");
    }
  }

  return {
    workspaceId,
    environmentId,
  };
}
