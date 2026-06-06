import { NextFunction, Request, Response } from "express";

import { prisma } from "../index";

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
