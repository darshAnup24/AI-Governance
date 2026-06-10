import { Router, Request, Response } from "express";
import { PERMISSIONS, requirePermission } from "../engine/rbacEngine";
import { prisma } from "../index";
import { TenantScopeError, resolveScopedTenantContext } from "../middleware/workspace";

export const usersRouter = Router();

// GET /api/users — list users in the current org
usersRouter.get("/", requirePermission(PERMISSIONS.canManageUsers), async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            where: { orgId: req.user!.orgId },
            include: {
                memberships: {
                    include: {
                        workspace: { select: { id: true, name: true, slug: true } },
                    },
                },
                sessions: {
                    where: { status: "ACTIVE" },
                    select: { id: true, ipAddress: true, deviceName: true, lastActiveAt: true },
                    take: 5,
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(users);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

usersRouter.patch("/:id/role", requirePermission(PERMISSIONS.canManageUsers), async (req: Request, res: Response) => {
    try {
        const { role, workspaceId, permissions } = req.body;
        const userId = String(req.params.id);
        const allowedRoles = [
          "OWNER",
          "ADMIN",
          "SECURITY_ADMIN",
          "COMPLIANCE_OFFICER",
          "AI_ENGINEER",
          "DEVELOPER",
          "SOC_ANALYST",
          "ANALYST",
          "AUDITOR",
          "VIEWER",
          "INCIDENT_RESPONDER",
        ];
        if (!allowedRoles.includes(role)) {
            res.status(400).json({ error: "Invalid role" });
            return;
        }
        await prisma.user.updateMany({
            where: { id: userId, orgId: req.user!.orgId },
            data: { role },
        });
        if (workspaceId) {
          const scoped = await resolveScopedTenantContext(req, {
            workspaceId,
          });
          const targetMembership = await prisma.membership.findFirst({
            where: {
              userId,
              workspaceId: scoped.workspaceId!,
              user: { orgId: req.user!.orgId },
              workspace: { orgId: req.user!.orgId },
            },
            select: { id: true },
          });
          if (!targetMembership) {
            res.status(404).json({ error: "User is not a member of this workspace in your organization" });
            return;
          }
          await prisma.membership.updateMany({
            where: { userId, workspaceId: scoped.workspaceId! },
            data: { role, permissions: permissions || undefined },
          });
        }
        const updated = await prisma.user.findFirst({
            where: { id: userId, orgId: req.user!.orgId },
            include: { memberships: true },
        });
        await prisma.auditLog.create({
          data: {
            orgId: req.user!.orgId,
            workspaceId: workspaceId || null,
            userId: req.user!.userId,
            action: "USER_ROLE_CHANGED",
            resource: "user",
            resourceId: userId,
            details: { role, permissions, workspaceId },
          },
        });
        res.json(updated);
    } catch (err: any) {
        if (err instanceof TenantScopeError) {
            res.status(err.statusCode).json({ error: err.message });
            return;
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/users/:id — remove user from org
usersRouter.delete("/:id", requirePermission(PERMISSIONS.canManageUsers), async (req: Request, res: Response) => {
    try {
        const userId = String(req.params.id);
        await prisma.user.deleteMany({
            where: { id: userId, orgId: req.user!.orgId },
        });
        res.json({ deleted: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
