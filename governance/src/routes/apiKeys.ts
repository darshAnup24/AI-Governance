import { Router, Request, Response } from "express";

import { generateAPIKey } from "../engine/authService";
import { PERMISSIONS, requirePermission } from "../engine/rbacEngine";
import { prisma } from "../index";

export const apiKeysRouter = Router();

apiKeysRouter.get(
  "/",
  requirePermission(PERMISSIONS.canManageApiKeys),
  async (req: Request, res: Response) => {
    const keys = await prisma.aPIKey.findMany({
      where: { orgId: req.user!.orgId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    res.json(keys);
  },
);

apiKeysRouter.post(
  "/",
  requirePermission(PERMISSIONS.canManageApiKeys),
  async (req: Request, res: Response) => {
    const { raw, prefix, hash } = generateAPIKey();
    const key = await prisma.aPIKey.create({
      data: {
        orgId: req.user!.orgId,
        workspaceId: req.body.workspaceId || req.workspaceId || null,
        environmentId: req.body.environmentId || req.environmentId || null,
        userId: req.user!.userId,
        name: req.body.name || "Service Key",
        keyPrefix: prefix,
        keyHash: hash,
        scopes: req.body.scopes || ["proxy:chat"],
        rateLimitPerMin: req.body.rateLimitPerMin || 60,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        orgId: req.user!.orgId,
        workspaceId: key.workspaceId,
        userId: req.user!.userId,
        action: "API_KEY_CREATED",
        resource: "api_key",
        resourceId: key.id,
        details: { scopes: key.scopes, environmentId: key.environmentId },
      },
    });

    res.status(201).json({ ...key, rawKey: raw });
  },
);

apiKeysRouter.post(
  "/:id/rotate",
  requirePermission(PERMISSIONS.canManageApiKeys),
  async (req: Request, res: Response) => {
    const keyId = String(req.params.id);
    const existing = await prisma.aPIKey.findFirst({
      where: { id: keyId, orgId: req.user!.orgId, revokedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    const { raw, prefix, hash } = generateAPIKey();
    const rotated = await prisma.aPIKey.update({
      where: { id: existing.id },
      data: {
        keyPrefix: prefix,
        keyHash: hash,
        revokedAt: null,
        isActive: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        orgId: req.user!.orgId,
        workspaceId: rotated.workspaceId,
        userId: req.user!.userId,
        action: "API_KEY_CREATED",
        resource: "api_key",
        resourceId: rotated.id,
        details: { rotated: true },
      },
    });

    res.json({ ...rotated, rawKey: raw });
  },
);

apiKeysRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.canManageApiKeys),
  async (req: Request, res: Response) => {
    const keyId = String(req.params.id);
    await prisma.aPIKey.updateMany({
      where: { id: keyId, orgId: req.user!.orgId },
      data: { revokedAt: new Date(), isActive: false },
    });
    await prisma.auditLog.create({
      data: {
        orgId: req.user!.orgId,
        userId: req.user!.userId,
        action: "API_KEY_REVOKED",
        resource: "api_key",
        resourceId: keyId,
      },
    });
    res.json({ revoked: true });
  },
);
