import { NextFunction, Request, Response } from "express";

import {
  AccessTokenClaims,
  touchSession,
  validateSession,
  verifyAccessToken,
} from "../engine/authService";
import { resolveAuthorizationContext } from "../engine/rbacEngine";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  orgId: string;
  orgName: string;
  permissions: string[];
  workspaceIds: string[];
  environmentIds: string[];
  membershipRoles: Record<string, string>;
  workspaceId?: string;
  environmentId?: string;
  sessionId: string;
  scope: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      workspaceId?: string;
      environmentId?: string;
      workspaceRole?: string;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  void authenticateRequest(token, req)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((error: any) => {
      res.status(401).json({ error: error.message || "Invalid or expired token" });
    });
}

async function authenticateRequest(
  token: string,
  req: Request,
): Promise<AuthUser> {
  const claims = verifyAccessToken(token) as AccessTokenClaims;
  if (!claims.sid) {
    throw new Error("Missing session claim");
  }

  const session = await validateSession(claims.sid);
  if (!session) {
    throw new Error("Session revoked or expired");
  }

  const authz = await resolveAuthorizationContext({
    userId: claims.userId,
    orgId: claims.orgId,
    workspaceId:
      String(req.headers["x-workspace-id"] || req.query.workspaceId || claims.workspaceId || ""),
    environmentId:
      String(
        req.headers["x-environment-id"] ||
          req.query.environmentId ||
          claims.environmentId ||
          "",
      ),
  });

  await touchSession(session.id, {
    ipAddress:
      (req.headers["x-forwarded-for"] as string) ||
      req.socket.remoteAddress ||
      undefined,
    userAgent: (req.headers["user-agent"] as string) || undefined,
  });

  return {
    userId: claims.userId,
    email: claims.email,
    name: claims.name,
    role: authz.activeRole || claims.role,
    orgId: claims.orgId,
    orgName: claims.orgName,
    permissions: authz.permissions,
    workspaceIds: authz.workspaceIds,
    environmentIds: authz.environmentIds,
    membershipRoles: authz.membershipRoles,
    workspaceId: authz.activeWorkspaceId || undefined,
    environmentId: authz.activeEnvironmentId || undefined,
    sessionId: session.id,
    scope: claims.scope,
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role access" });
      return;
    }
    next();
  };
}

export function requireGovernanceScope(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.scope === "demo") {
    res.status(403).json({
      error: "Demo tokens cannot access governance APIs",
      code: "DEMO_SCOPE_REJECTED",
    });
    return;
  }
  next();
}
