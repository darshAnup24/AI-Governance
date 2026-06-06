import { NextFunction, Request, Response } from "express";

import { prisma } from "../index";

type ScopeType = "org" | "workspace" | "environment";

export const PERMISSIONS = {
  canManagePolicies: "can_manage_policies",
  canViewIncidents: "can_view_incidents",
  canManageIncidents: "can_manage_incidents",
  canExportReports: "can_export_reports",
  canManageModels: "can_manage_models",
  canManageProviders: "can_manage_providers",
  canManageWorkspaces: "can_manage_workspaces",
  canViewCompliance: "can_view_compliance",
  canManageUsers: "can_manage_users",
  canManageSso: "can_manage_sso",
  canManageBilling: "can_manage_billing",
  canManageApiKeys: "can_manage_api_keys",
  canViewAuditLogs: "can_view_audit_logs",
  canManageInvitations: "can_manage_invitations",
  canManageOrganization: "can_manage_organization",
  canViewDashboard: "can_view_dashboard",
  canManageSessions: "can_manage_sessions",
  canManageEnvironments: "can_manage_environments",
  canManageRoles: "can_manage_roles",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

type RoleTemplate = {
  inherits?: string[];
  permissions: Permission[];
  deniedPermissions?: Permission[];
};

const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  OWNER: {
    permissions: Object.values(PERMISSIONS),
  },
  ADMIN: {
    permissions: [
      PERMISSIONS.canManagePolicies,
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canManageIncidents,
      PERMISSIONS.canExportReports,
      PERMISSIONS.canManageModels,
      PERMISSIONS.canManageProviders,
      PERMISSIONS.canManageWorkspaces,
      PERMISSIONS.canViewCompliance,
      PERMISSIONS.canManageUsers,
      PERMISSIONS.canManageApiKeys,
      PERMISSIONS.canViewAuditLogs,
      PERMISSIONS.canManageInvitations,
      PERMISSIONS.canManageOrganization,
      PERMISSIONS.canViewDashboard,
      PERMISSIONS.canManageSessions,
      PERMISSIONS.canManageEnvironments,
      PERMISSIONS.canManageRoles,
    ],
  },
  SECURITY_ADMIN: {
    permissions: [
      PERMISSIONS.canManagePolicies,
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canManageIncidents,
      PERMISSIONS.canManageProviders,
      PERMISSIONS.canManageApiKeys,
      PERMISSIONS.canViewAuditLogs,
      PERMISSIONS.canViewDashboard,
      PERMISSIONS.canViewCompliance,
      PERMISSIONS.canManageSessions,
    ],
  },
  COMPLIANCE_OFFICER: {
    permissions: [
      PERMISSIONS.canViewCompliance,
      PERMISSIONS.canExportReports,
      PERMISSIONS.canViewAuditLogs,
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canViewDashboard,
    ],
  },
  AI_ENGINEER: {
    permissions: [
      PERMISSIONS.canManageModels,
      PERMISSIONS.canManageProviders,
      PERMISSIONS.canManageApiKeys,
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canManagePolicies,
      PERMISSIONS.canViewDashboard,
    ],
  },
  DEVELOPER: {
    permissions: [
      PERMISSIONS.canManageModels,
      PERMISSIONS.canViewDashboard,
    ],
    deniedPermissions: [PERMISSIONS.canManageProviders],
  },
  SOC_ANALYST: {
    permissions: [
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canManageIncidents,
      PERMISSIONS.canViewAuditLogs,
      PERMISSIONS.canViewDashboard,
    ],
  },
  ANALYST: {
    permissions: [
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canViewCompliance,
      PERMISSIONS.canViewDashboard,
    ],
  },
  AUDITOR: {
    permissions: [
      PERMISSIONS.canViewAuditLogs,
      PERMISSIONS.canExportReports,
      PERMISSIONS.canViewCompliance,
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canViewDashboard,
    ],
  },
  VIEWER: {
    permissions: [
      PERMISSIONS.canViewDashboard,
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canViewCompliance,
    ],
  },
  INCIDENT_RESPONDER: {
    permissions: [
      PERMISSIONS.canViewIncidents,
      PERMISSIONS.canManageIncidents,
      PERMISSIONS.canViewAuditLogs,
      PERMISSIONS.canViewDashboard,
    ],
  },
};

export type AuthorizationContext = {
  orgId: string;
  userId: string;
  activeRole: string;
  activeWorkspaceId: string | null;
  activeEnvironmentId: string | null;
  permissions: Permission[];
  membershipRoles: Record<string, string>;
  workspaceIds: string[];
  environmentIds: string[];
};

export async function resolveAuthorizationContext(input: {
  userId: string;
  orgId: string;
  workspaceId?: string;
  environmentId?: string;
}): Promise<AuthorizationContext> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, orgId: input.orgId, isActive: true },
    include: {
      organization: true,
      memberships: {
        include: {
          workspace: {
            include: { environments: true },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found in organization");
  }

  const activeMembership =
    user.memberships.find((membership) => membership.workspaceId === input.workspaceId) ||
    user.memberships[0] ||
    null;

  const activeWorkspaceId = activeMembership?.workspaceId || null;
  const availableWorkspaceIds = user.memberships.map((membership) => membership.workspaceId);
  const activeEnvironmentId =
    input.environmentId ||
    activeMembership?.workspace.environments[0]?.id ||
    null;
  const availableEnvironmentIds = user.memberships.flatMap((membership) =>
    membership.workspace.environments.map((environment) => environment.id),
  );

  const membershipRoles = Object.fromEntries(
    user.memberships.map((membership) => [membership.workspaceId, membership.role]),
  );

  const organizationSettings = (user.organization.settings || {}) as Record<string, any>;
  const customRoles = organizationSettings.customRoles || {};
  const roleName = activeMembership?.role || user.role;
  const template = resolveRoleTemplate(roleName, customRoles);
  const directPermissions = readMembershipPermissionOverrides(
    activeMembership?.permissions,
  );
  const granted = new Set<Permission>([
    ...template.permissions,
    ...directPermissions.allow,
  ]);
  for (const deniedPermission of [...template.deniedPermissions, ...directPermissions.deny]) {
    granted.delete(deniedPermission);
  }

  return {
    orgId: user.orgId,
    userId: user.id,
    activeRole: roleName,
    activeWorkspaceId,
    activeEnvironmentId,
    permissions: Array.from(granted),
    membershipRoles,
    workspaceIds: availableWorkspaceIds,
    environmentIds: availableEnvironmentIds,
  };
}

export function roleHasPermission(role: string, permission: Permission) {
  return resolveRoleTemplate(role).permissions.includes(permission);
}

export function requirePermission(
  permission: Permission,
  options?: { scope?: ScopeType; allowOrgOwnerBypass?: boolean },
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const allowed = await hasPermission(req, permission, options);
      if (!allowed) {
        res.status(403).json({
          error: "Insufficient permissions",
          permission,
          scope: options?.scope || "org",
        });
        return;
      }
      next();
    } catch (error: any) {
      res.status(403).json({ error: error.message || "Authorization failed" });
    }
  };
}

export function authorizeRoute(resource: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const permission = permissionForRoute(resource, req.method);
    if (!permission) {
      next();
      return;
    }
    return requirePermission(permission, {
      scope:
        req.environmentId || req.headers["x-environment-id"]
          ? "environment"
          : req.workspaceId || req.headers["x-workspace-id"]
            ? "workspace"
            : "org",
    })(req, res, next);
  };
}

export async function hasPermission(
  req: Request,
  permission: Permission,
  options?: { scope?: ScopeType; allowOrgOwnerBypass?: boolean },
) {
  const user = req.user;
  if (!user) {
    return false;
  }
  if (
    options?.allowOrgOwnerBypass !== false &&
    user.role === "OWNER" &&
    user.permissions.includes(permission)
  ) {
    return true;
  }
  if (!user.permissions.includes(permission)) {
    return false;
  }

  if (options?.scope === "workspace" && req.workspaceId) {
    return user.workspaceIds.includes(req.workspaceId);
  }
  if (options?.scope === "environment" && req.environmentId) {
    return user.environmentIds.includes(req.environmentId);
  }
  return true;
}

export function permissionForRoute(
  resource: string,
  method: string,
): Permission | null {
  const normalized = method.toUpperCase();
  if (resource === "dashboard") return PERMISSIONS.canViewDashboard;
  if (resource === "policy") return PERMISSIONS.canManagePolicies;
  if (resource === "incident") {
    return normalized === "GET"
      ? PERMISSIONS.canViewIncidents
      : PERMISSIONS.canManageIncidents;
  }
  if (resource === "model") return PERMISSIONS.canManageModels;
  if (resource === "provider") return PERMISSIONS.canManageProviders;
  if (resource === "workspace") return PERMISSIONS.canManageWorkspaces;
  if (resource === "environment") return PERMISSIONS.canManageEnvironments;
  if (resource === "compliance") return PERMISSIONS.canViewCompliance;
  if (resource === "report") return PERMISSIONS.canExportReports;
  if (resource === "user") return PERMISSIONS.canManageUsers;
  if (resource === "sso") return PERMISSIONS.canManageSso;
  if (resource === "billing") return PERMISSIONS.canManageBilling;
  if (resource === "api_key") return PERMISSIONS.canManageApiKeys;
  if (resource === "audit") return PERMISSIONS.canViewAuditLogs;
  if (resource === "invitation") return PERMISSIONS.canManageInvitations;
  if (resource === "organization") return PERMISSIONS.canManageOrganization;
  return null;
}

function resolveRoleTemplate(
  role: string,
  customRoles?: Record<string, any>,
): { permissions: Permission[]; deniedPermissions: Permission[] } {
  const base = ROLE_TEMPLATES[role];
  if (base) {
    return {
      permissions: [...base.permissions],
      deniedPermissions: [...(base.deniedPermissions || [])],
    };
  }

  const custom = customRoles?.[role];
  if (!custom) {
    return { permissions: [], deniedPermissions: [] };
  }

  const inherited = (custom.inherits || [])
    .flatMap((parentRole: string) => resolveRoleTemplate(parentRole, customRoles).permissions);
  const deniedInherited = (custom.inherits || [])
    .flatMap((parentRole: string) => resolveRoleTemplate(parentRole, customRoles).deniedPermissions);

  return {
    permissions: Array.from(
      new Set<Permission>([...inherited, ...((custom.permissions || []) as Permission[])]),
    ),
    deniedPermissions: Array.from(
      new Set<Permission>([
        ...deniedInherited,
        ...((custom.deniedPermissions || []) as Permission[]),
      ]),
    ),
  };
}

function readMembershipPermissionOverrides(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return { allow: [] as Permission[], deny: [] as Permission[] };
  }
  const object = raw as Record<string, unknown>;
  if (Array.isArray(object)) {
    return { allow: object as Permission[], deny: [] as Permission[] };
  }
  return {
    allow: Array.isArray(object.allow) ? (object.allow as Permission[]) : [],
    deny: Array.isArray(object.deny) ? (object.deny as Permission[]) : [],
  };
}
