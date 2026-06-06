import { Router, Request, Response } from "express";

import { PERMISSIONS, requirePermission } from "../engine/rbacEngine";
import { prisma } from "../index";

export const settingsRouter = Router();

settingsRouter.get("/profile", async (req: Request, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      companySize: true,
      domain: true,
      logo: true,
      region: true,
      plan: true,
      settings: true,
      features: true,
      billingEmail: true,
    },
  });
  res.json(org);
});

settingsRouter.put(
  "/profile",
  requirePermission(PERMISSIONS.canManageOrganization),
  async (req: Request, res: Response) => {
    const updated = await prisma.organization.update({
      where: { id: req.user!.orgId },
      data: {
        name: req.body.name ?? undefined,
        industry: req.body.industry ?? undefined,
        companySize: req.body.companySize ?? undefined,
        domain: req.body.domain ?? undefined,
        logo: req.body.logo ?? undefined,
        region: req.body.region ?? undefined,
        billingEmail: req.body.billingEmail ?? undefined,
        settings: req.body.settings ?? undefined,
        features: req.body.features ?? undefined,
      },
    });
    res.json(updated);
  },
);

settingsRouter.get("/sso", async (req: Request, res: Response) => {
  const config = await prisma.sSOConfiguration.findUnique({
    where: { orgId: req.user!.orgId },
  });
  res.json(
    config || {
      configured: false,
      provider: null,
      isActive: false,
      settings: {},
    },
  );
});

settingsRouter.put(
  "/sso",
  requirePermission(PERMISSIONS.canManageSso),
  async (req: Request, res: Response) => {
    const settings = {
      ...req.body.settings,
      domainVerification: req.body.domainVerification || "pending",
      roleMapping: req.body.roleMapping || {},
      scimReady: true,
    };
    const sso = await prisma.sSOConfiguration.upsert({
      where: { orgId: req.user!.orgId },
      update: {
        provider: req.body.provider || "oidc",
        issuerUrl: req.body.issuerUrl || null,
        clientId: req.body.clientId || null,
        clientSecretEncrypted: req.body.clientSecret || null,
        certificate: req.body.certificate || null,
        isActive: req.body.isActive ?? false,
        settings,
      },
      create: {
        orgId: req.user!.orgId,
        provider: req.body.provider || "oidc",
        issuerUrl: req.body.issuerUrl || null,
        clientId: req.body.clientId || null,
        clientSecretEncrypted: req.body.clientSecret || null,
        certificate: req.body.certificate || null,
        isActive: req.body.isActive ?? false,
        settings,
      },
    });
    await prisma.auditLog.create({
      data: {
        orgId: req.user!.orgId,
        userId: req.user!.userId,
        action: "SSO_CONFIGURED",
        resource: "sso_configuration",
        resourceId: sso.id,
        details: { provider: sso.provider, isActive: sso.isActive },
      },
    });
    res.json(sso);
  },
);

settingsRouter.get("/usage", async (req: Request, res: Response) => {
  const orgId = req.user!.orgId;
  const [users, workspaces, incidents, providers, keys] = await Promise.all([
    prisma.user.count({ where: { orgId } }),
    prisma.workspace.count({ where: { orgId } }),
    prisma.incident.count({ where: { orgId } }),
    prisma.provider.count({ where: { orgId } }),
    prisma.aPIKey.count({ where: { orgId, revokedAt: null } }),
  ]);
  res.json({ users, workspaces, incidents, providers, apiKeys: keys });
});

settingsRouter.get("/runtime", async (req: Request, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.orgId },
    select: { settings: true, features: true },
  });
  const settings = (org?.settings as Record<string, any> | null) || {};
  const runtime = settings.runtime || {};
  res.json({
    mode: runtime.mode || "STANDARD",
    failClosedCategories: runtime.failClosedCategories || ["PII", "CREDENTIALS", "CONFIDENTIAL"],
    retentionDays: runtime.retentionDays || 30,
    degradedBannerEnabled: runtime.degradedBannerEnabled ?? true,
    webhookTargets: runtime.webhookTargets || [],
    siemTargets: runtime.siemTargets || [],
  });
});

settingsRouter.put(
  "/runtime",
  requirePermission(PERMISSIONS.canManageOrganization),
  async (req: Request, res: Response) => {
    const existing = await prisma.organization.findUnique({
      where: { id: req.user!.orgId },
      select: { settings: true },
    });
    const mergedSettings = {
      ...((existing?.settings as Record<string, any> | null) || {}),
      runtime: {
        mode: req.body.mode || "STANDARD",
        failClosedCategories: req.body.failClosedCategories || ["PII", "CREDENTIALS", "CONFIDENTIAL"],
        retentionDays: req.body.retentionDays || 30,
        degradedBannerEnabled: req.body.degradedBannerEnabled ?? true,
        webhookTargets: req.body.webhookTargets || [],
        siemTargets: req.body.siemTargets || [],
      },
    };

    const updated = await prisma.organization.update({
      where: { id: req.user!.orgId },
      data: { settings: mergedSettings as any },
    });

    await prisma.auditLog.create({
      data: {
        orgId: req.user!.orgId,
        userId: req.user!.userId,
        action: "SETTINGS_UPDATED",
        resource: "runtime_settings",
        details: mergedSettings.runtime,
      },
    });

    res.json((updated.settings as Record<string, any>).runtime || {});
  },
);
