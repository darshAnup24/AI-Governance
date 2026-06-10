import { Router, Request, Response } from "express";

import { prisma } from "../index";
import { PERMISSIONS, requirePermission } from "../engine/rbacEngine";
import { TenantScopeError, resolveScopedTenantContext } from "../middleware/workspace";

export const organizationsRouter = Router();

organizationsRouter.get("/", async (req: Request, res: Response) => {
  res.redirect("/api/organization/profile");
});

organizationsRouter.get("/profile", async (req: Request, res: Response) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.orgId },
      include: {
        _count: {
          select: {
            users: true,
            workspaces: true,
            aiModels: true,
            incidents: true,
            providers: true,
          },
        },
      },
    });
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.json(org);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

organizationsRouter.patch(
  "/profile",
  requirePermission(PERMISSIONS.canManageOrganization),
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        industry,
        companySize,
        domain,
        logo,
        region,
        settings,
        features,
      } = req.body;
      const current = await prisma.organization.findUnique({
        where: { id: req.user!.orgId },
      });
      if (!current) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const nextSettings = {
        ...(current.settings as Record<string, unknown>),
        ...(settings || {}),
      };
      const nextFeatures = {
        ...(current.features as Record<string, unknown>),
        ...(features || {}),
      };

      const org = await prisma.organization.update({
        where: { id: req.user!.orgId },
        data: {
          name: name ?? undefined,
          industry: industry ?? undefined,
          companySize: companySize ?? undefined,
          domain: domain ?? undefined,
          logo: logo ?? undefined,
          region: region ?? undefined,
          settings: nextSettings,
          features: nextFeatures,
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: req.user!.orgId,
          userId: req.user!.userId,
          action: "ORGANIZATION_UPDATED",
          resource: "organization",
          resourceId: org.id,
          details: { updatedKeys: Object.keys(req.body || {}) },
        },
      });

      res.json(org);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

organizationsRouter.get("/workspaces", async (req: Request, res: Response) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: { orgId: req.user!.orgId },
      include: {
        environments: { orderBy: { createdAt: "asc" } },
        _count: {
          select: { memberships: true, policies: true, models: true, incidents: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(workspaces);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

organizationsRouter.post(
  "/workspaces",
  requirePermission(PERMISSIONS.canManageWorkspaces),
  async (req: Request, res: Response) => {
    try {
      const { name, type, description } = req.body;
      if (!name) {
        res.status(400).json({ error: "Workspace name required" });
        return;
      }

      const slug = slugify(name);
      const existing = await prisma.workspace.findUnique({
        where: { orgId_slug: { orgId: req.user!.orgId, slug } },
      });
      if (existing) {
        res.status(409).json({ error: "Workspace with this slug already exists" });
        return;
      }

      const workspace = await prisma.workspace.create({
        data: {
          orgId: req.user!.orgId,
          name,
          slug,
          type: type || "DEVELOPMENT",
          description: description || "",
          settings: { securityTier: "standard", createdBy: req.user!.userId },
        },
      });

      await prisma.environment.createMany({
        data: [
          { workspaceId: workspace.id, name: "Production", slug: "production", type: "PRODUCTION" },
          { workspaceId: workspace.id, name: "Staging", slug: "staging", type: "STAGING" },
          { workspaceId: workspace.id, name: "Development", slug: "development", type: "DEVELOPMENT" },
          { workspaceId: workspace.id, name: "Sandbox", slug: "sandbox", type: "SANDBOX" },
        ],
      });

      await prisma.membership.create({
        data: {
          userId: req.user!.userId,
          workspaceId: workspace.id,
          role: "OWNER",
          permissions: { allow: Object.values(PERMISSIONS), deny: [] },
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: req.user!.orgId,
          workspaceId: workspace.id,
          userId: req.user!.userId,
          action: "WORKSPACE_CREATED",
          resource: "workspace",
          resourceId: workspace.id,
          details: { name, type },
        },
      });

      res.status(201).json(workspace);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

organizationsRouter.post(
  "/workspaces/:workspaceId/environments",
  requirePermission(PERMISSIONS.canManageEnvironments, { scope: "workspace" }),
  async (req: Request, res: Response) => {
    try {
      const scoped = await resolveScopedTenantContext(req, {
        workspaceId: String(req.params.workspaceId),
      });
      const workspaceId = scoped.workspaceId!;
      const { name, type, settings } = req.body;
      if (!name) {
        res.status(400).json({ error: "Environment name required" });
        return;
      }

      const environment = await prisma.environment.create({
        data: {
          workspaceId,
          name,
          slug: slugify(name),
          type: type || "DEVELOPMENT",
          settings: settings || {},
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: req.user!.orgId,
          workspaceId,
          userId: req.user!.userId,
          action: "ENVIRONMENT_CREATED",
          resource: "environment",
          resourceId: environment.id,
          details: { name, type },
        },
      });

      res.status(201).json(environment);
    } catch (err: any) {
      if (err instanceof TenantScopeError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  },
);

organizationsRouter.get("/members", async (req: Request, res: Response) => {
  try {
    const members = await prisma.user.findMany({
      where: { orgId: req.user!.orgId },
      include: {
        memberships: {
          include: {
            workspace: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

organizationsRouter.get("/onboarding", async (req: Request, res: Response) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.orgId },
      include: {
        _count: {
          select: {
            users: true,
            workspaces: true,
            providers: true,
            policyRules: true,
            aiModels: true,
          },
        },
      },
    });
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const steps = {
      organizationCreated: true,
      workspaceCreated: org._count.workspaces > 0,
      complianceConfigured: Array.isArray((org.settings as any)?.complianceFrameworks)
        ? (org.settings as any).complianceFrameworks.length > 0
        : false,
      teamInvited: org._count.users > 1,
      providerConnected: org._count.providers > 0,
      policiesCreated: org._count.policyRules > 0,
      modelsRegistered: org._count.aiModels > 0,
    };
    const completedSteps = Object.values(steps).filter(Boolean).length;
    res.json({
      steps,
      completedSteps,
      totalSteps: Object.keys(steps).length,
      percentage: Math.round((completedSteps / Object.keys(steps).length) * 100),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

organizationsRouter.put(
  "/onboarding",
  requirePermission(PERMISSIONS.canManageOrganization),
  async (req: Request, res: Response) => {
    try {
      const current = await prisma.organization.findUnique({
        where: { id: req.user!.orgId },
      });
      if (!current) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }
      const mergedSettings = {
        ...(current.settings as Record<string, unknown>),
        onboarding: req.body,
        complianceFrameworks: req.body.complianceFrameworks || [],
        industry: req.body.industry || current.industry,
      };
      const organization = await prisma.organization.update({
        where: { id: req.user!.orgId },
        data: { settings: mergedSettings },
      });
      res.json(organization);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

organizationsRouter.get("/roles", async (req: Request, res: Response) => {
  const organization = await prisma.organization.findUnique({
    where: { id: req.user!.orgId },
    select: { settings: true },
  });
  const customRoles = ((organization?.settings as any)?.customRoles || {}) as Record<
    string,
    unknown
  >;
  res.json(customRoles);
});

organizationsRouter.put(
  "/roles/:roleName",
  requirePermission(PERMISSIONS.canManageRoles),
  async (req: Request, res: Response) => {
    const organization = await prisma.organization.findUnique({
      where: { id: req.user!.orgId },
      select: { settings: true },
    });
    const settings = (organization?.settings || {}) as Record<string, any>;
    const customRoles = { ...(settings.customRoles || {}) };
    const roleName = String(req.params.roleName);
    customRoles[roleName] = {
      inherits: req.body.inherits || [],
      permissions: req.body.permissions || [],
      deniedPermissions: req.body.deniedPermissions || [],
      scopes: req.body.scopes || ["org"],
    };
    await prisma.organization.update({
      where: { id: req.user!.orgId },
      data: {
        settings: { ...settings, customRoles },
      },
    });
    res.json(customRoles[roleName]);
  },
);

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
}
