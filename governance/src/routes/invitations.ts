import { Router, Request, Response } from "express";

import { hashPassword, generateInvitationToken } from "../engine/authService";
import { PERMISSIONS, requirePermission } from "../engine/rbacEngine";
import { prisma } from "../index";

export const invitationsRouter = Router();

invitationsRouter.get("/", async (req: Request, res: Response) => {
  const invitations = await prisma.invitation.findMany({
    where: { orgId: req.user!.orgId },
    include: {
      inviter: { select: { id: true, name: true, email: true } },
      workspace: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(invitations);
});

invitationsRouter.post(
  "/",
  requirePermission(PERMISSIONS.canManageInvitations),
  async (req: Request, res: Response) => {
    try {
      const { email, role, workspaceId } = req.body;
      if (!email) {
        res.status(400).json({ error: "Email required" });
        return;
      }

      const organization = await prisma.organization.findUnique({
        where: { id: req.user!.orgId },
        select: { domain: true, settings: true },
      });
      const orgSettings = (organization?.settings || {}) as Record<string, any>;
      const domainAllowlist = orgSettings.domainAllowlist || [];
      const emailDomain = email.split("@")[1]?.toLowerCase() || "";
      if (domainAllowlist.length > 0 && !domainAllowlist.includes(emailDomain)) {
        res.status(400).json({ error: "Email domain is not allowed for this organization" });
        return;
      }

      const existingUser = await prisma.user.findFirst({
        where: { orgId: req.user!.orgId, email },
      });
      if (existingUser) {
        res.status(409).json({ error: "User already belongs to organization" });
        return;
      }

      const invitation = await prisma.invitation.create({
        data: {
          orgId: req.user!.orgId,
          inviterId: req.user!.userId,
          email,
          role: role || "VIEWER",
          workspaceId: workspaceId || null,
          token: generateInvitationToken(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: req.user!.orgId,
          userId: req.user!.userId,
          workspaceId: workspaceId || null,
          action: "INVITATION_CREATED",
          resource: "invitation",
          resourceId: invitation.id,
          details: { email, role },
        },
      });

      res.status(201).json(invitation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

invitationsRouter.post(
  "/bulk",
  requirePermission(PERMISSIONS.canManageInvitations),
  async (req: Request, res: Response) => {
    const invitations = Array.isArray(req.body.invitations) ? req.body.invitations : [];
    const created = [];
    const errors = [];

    for (const invite of invitations.slice(0, 50)) {
      try {
        const invitation = await prisma.invitation.create({
          data: {
            orgId: req.user!.orgId,
            inviterId: req.user!.userId,
            email: invite.email,
            role: invite.role || "VIEWER",
            workspaceId: invite.workspaceId || null,
            token: generateInvitationToken(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        created.push(invitation);
      } catch (error: any) {
        errors.push({ email: invite.email, error: error.message });
      }
    }

    res.status(201).json({ invitations: created, errors });
  },
);

invitationsRouter.post("/accept", async (req: Request, res: Response) => {
  try {
    const { token, name, password } = req.body;
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation) {
      res.status(404).json({ error: "Invalid invitation token" });
      return;
    }
    if (invitation.status !== "PENDING") {
      res.status(400).json({ error: "Invitation already processed" });
      return;
    }
    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      res.status(400).json({ error: "Invitation expired" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email: invitation.email },
      update: {
        orgId: invitation.orgId,
        name: name || invitation.email.split("@")[0],
        role: invitation.role,
        passwordHash,
        isActive: true,
      },
      create: {
        email: invitation.email,
        name: name || invitation.email.split("@")[0],
        role: invitation.role,
        orgId: invitation.orgId,
        passwordHash,
      },
    });

    if (invitation.workspaceId) {
      await prisma.membership.upsert({
        where: {
          userId_workspaceId: {
            userId: user.id,
            workspaceId: invitation.workspaceId,
          },
        },
        update: {
          role: invitation.role,
        },
        create: {
          userId: user.id,
          workspaceId: invitation.workspaceId,
          role: invitation.role,
        },
      });
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        orgId: invitation.orgId,
        workspaceId: invitation.workspaceId || null,
        userId: user.id,
        action: "INVITATION_ACCEPTED",
        resource: "invitation",
        resourceId: invitation.id,
        details: { email: invitation.email },
      },
    });

    res.json({ accepted: true, email: invitation.email });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

invitationsRouter.post(
  "/:id/revoke",
  requirePermission(PERMISSIONS.canManageInvitations),
  async (req: Request, res: Response) => {
    const invitationId = String(req.params.id);
    await prisma.invitation.updateMany({
      where: { id: invitationId, orgId: req.user!.orgId, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    res.json({ revoked: true });
  },
);
