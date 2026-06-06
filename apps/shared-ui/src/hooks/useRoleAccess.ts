const ROLE_HIERARCHY: Record<string, number> = {
  OWNER: 0, ADMIN: 1, SECURITY_ADMIN: 2, COMPLIANCE_OFFICER: 2,
  INCIDENT_RESPONDER: 3, AI_ENGINEER: 3, DEVELOPER: 4, ANALYST: 4,
  VIEWER: 5, AUDITOR: 5,
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ['*:*'],
  ADMIN: ['organization:*', 'workspace:*', 'user:*', 'policy:*', 'incident:*', 'model:*', 'provider:*', 'compliance:*', 'report:*', 'audit:*', 'settings:*', 'billing:*'],
  SECURITY_ADMIN: ['policy:*', 'incident:*', 'model:read', 'compliance:read', 'audit:*'],
  COMPLIANCE_OFFICER: ['compliance:*', 'policy:read', 'policy:create', 'report:*', 'audit:read'],
  INCIDENT_RESPONDER: ['incident:*', 'policy:read', 'model:read', 'audit:read'],
  AI_ENGINEER: ['model:*', 'provider:read', 'provider:update', 'policy:read', 'incident:read'],
  DEVELOPER: ['model:read', 'environment:read', 'workspace:read', 'policy:read'],
  ANALYST: ['model:read', 'incident:read', 'compliance:read', 'report:read', 'audit:read'],
  VIEWER: ['dashboard:read', 'model:read', 'incident:read', 'compliance:read', 'report:read'],
  AUDITOR: ['audit:*', 'report:read', 'compliance:read', 'incident:read', 'user:read'],
};

export function useRoleAccess(role: string | undefined) {
  const userRole = role || 'VIEWER'
  const level = ROLE_HIERARCHY[userRole] ?? 999

  const hasPermission = (resource: string, action: string): boolean => {
    const perms = ROLE_PERMISSIONS[userRole]
    if (!perms) return false
    return perms.some(p => {
      if (p === '*:*') return true
      if (p === `${resource}:*`) return true
      if (p === `*:${action}`) return true
      return p === `${resource}:${action}`
    })
  }

  const hasRole = (...roles: string[]): boolean => roles.includes(userRole)
  const minLevel = (maxLevel: number): boolean => level <= maxLevel

  return {
    role: userRole,
    level,
    hasPermission,
    hasRole,
    minLevel,
    isOwner: userRole === 'OWNER',
    isAdmin: ['OWNER', 'ADMIN'].includes(userRole),
    isSecurityAdmin: ['OWNER', 'ADMIN', 'SECURITY_ADMIN'].includes(userRole),
    canManageUsers: hasPermission('user', '*') || hasPermission('user', 'create'),
    canManagePolicies: hasPermission('policy', '*') || hasPermission('policy', 'create'),
    canManageIncidents: hasPermission('incident', '*') || hasPermission('incident', 'create'),
    canViewAudit: hasPermission('audit', '*') || hasPermission('audit', 'read'),
    canManageSettings: hasPermission('settings', '*') || hasPermission('settings', 'update'),
    canManageProviders: hasPermission('provider', '*') || hasPermission('provider', 'create'),
    canManageBilling: hasPermission('billing', '*') || hasPermission('billing', 'read'),
    canManageWorkspaces: hasPermission('workspace', '*') || hasPermission('workspace', 'create'),
    canManageCompliance: hasPermission('compliance', '*') || hasPermission('compliance', 'create'),
  }
}
