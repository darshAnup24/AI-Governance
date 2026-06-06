import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { authMiddleware } from '../middleware/auth';
import {
  hashPassword,
  verifyPassword,
  verifyAccessToken,
  verifyRefreshToken,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  generateMFASecret,
  verifyTOTP,
  generateBackupCodes,
  generateVerificationToken,
  generatePasswordResetToken,
  checkBruteForce,
  recordLoginAttempt,
  issueAuthSession,
} from '../engine/authService';

export const authRouter = Router();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function buildUniqueOrganizationIdentity(params: {
  orgName?: string;
  name: string;
  email: string;
}): Promise<{ name: string; slug: string }> {
  const preferredName =
    params.orgName?.trim() ||
    `${params.name.trim() || params.email.split('@')[0]}'s Organization`;
  const baseName = preferredName.slice(0, 120);
  const slugSeed =
    params.orgName?.trim() ||
    params.email.split('@')[0] ||
    params.name.trim() ||
    'organization';
  const baseSlug = slugify(slugSeed) || 'organization';

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const suffix = attempt === 0 ? '' : ` ${attempt + 1}`;
    const slugSuffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidateName = `${baseName}${suffix}`.slice(0, 120);
    const candidateSlug = `${baseSlug}${slugSuffix}`.slice(0, 50);
    const existing = await prisma.organization.findFirst({
      where: {
        OR: [{ name: candidateName }, { slug: candidateSlug }],
      },
      select: { id: true },
    });
    if (!existing) {
      return { name: candidateName, slug: candidateSlug };
    }
  }

  return {
    name: `${baseName} ${Date.now().toString().slice(-6)}`.slice(0, 120),
    slug: `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 50),
  };
}

// ─── Helper to get client info ──────────────────────────────
function getClientInfo(req: Request) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
    userAgent: (req.headers['user-agent'] as string) || 'unknown',
  };
}

// ─── Helper to write an audit log without blocking the request ─
//
// Audit logs are observability data and must NEVER block the auth
// critical path. A failed write (FK violation, missing org, DB blip)
// is logged to console and swallowed so the login response still goes
// out to the user.
async function safeAuditLog(data: any): Promise<void> {
  try {
    await prisma.auditLog.create({ data });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn('[audit] skipped audit log:', err?.message || err);
  }
}

async function safeAuditLogMany(data: any[]): Promise<void> {
  try {
    await prisma.auditLog.createMany({ data });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn('[audit] skipped audit batch:', err?.message || err);
  }
}

// ─── SIGNUP ──────────────────────────────────────────────────
authRouter.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name, orgName, industry, companySize } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    // Password complexity: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]{8,}$/;
    if (!passwordRegex.test(password)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character',
      });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await hashPassword(password);

    const orgIdentity = await buildUniqueOrganizationIdentity({
      orgName,
      name,
      email,
    });

    // Create organization
    const org = await prisma.organization.create({
      data: {
        name: orgIdentity.name,
        slug: orgIdentity.slug,
        industry: industry || 'OTHER',
        companySize: companySize || 'STARTUP',
        plan: 'FREE',
        features: {
          maxWorkspaces: 3,
          maxUsers: 10,
          maxModels: 20,
          auditRetentionDays: 30,
          ssoEnabled: false,
          apiAccess: true,
        },
        settings: {
          dataRetentionDays: 90,
          complianceAutoScan: false,
          notificationEmail: email,
        },
      },
    });

    // Create default Production workspace
    const workspace = await prisma.workspace.create({
      data: {
        orgId: org.id,
        name: 'Production',
        slug: 'production',
        type: 'PRODUCTION',
        settings: { isDefault: true },
      },
    });

    // Create default environments
    await prisma.environment.createMany({
      data: [
        { workspaceId: workspace.id, name: 'Production', slug: 'production', type: 'PRODUCTION' },
        { workspaceId: workspace.id, name: 'Staging', slug: 'staging', type: 'STAGING' },
        { workspaceId: workspace.id, name: 'Development', slug: 'development', type: 'DEVELOPMENT' },
      ],
    });

    // Create user as OWNER
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'OWNER',
        orgId: org.id,
        emailVerified: false,
        emailVerificationToken: generateVerificationToken(),
        preferences: { theme: 'dark', notifications: true, locale: 'en' },
      },
    });

    // Create membership
    await prisma.membership.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'OWNER',
      },
    });

    const { ipAddress, userAgent } = getClientInfo(req);

    // Generate tokens
    const tokens = await issueAuthSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: org.id,
      orgName: org.name,
      workspaceId: workspace.id,
      environmentId: null,
    }, { ipAddress, userAgent });

    // Audit
    await safeAuditLog({
      orgId: org.id,
      userId: user.id,
      action: 'LOGIN',
      resource: 'user',
      resourceId: user.id,
      details: { event: 'account_created', workspace: workspace.id },
      ipAddress,
      userAgent,
    });

    // Also create the LOGIN_FAILED, ORGANIZATION_CREATED, WORKSPACE_CREATED, USER_CREATED, etc. events
    await safeAuditLogMany([
      { orgId: org.id, userId: user.id, action: 'ORGANIZATION_CREATED', resource: 'organization', resourceId: org.id, details: { name: org.name }, ipAddress, userAgent },
      { orgId: org.id, userId: user.id, action: 'WORKSPACE_CREATED', resource: 'workspace', resourceId: workspace.id, details: { name: 'Production' }, ipAddress, userAgent },
      { orgId: org.id, userId: user.id, action: 'USER_CREATED', resource: 'user', resourceId: user.id, details: { email }, ipAddress, userAgent },
    ]);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
        workspace: { id: workspace.id, name: workspace.name },
        emailVerified: false,
      },
      ...tokens,
    });
  } catch (err: any) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      res.status(409).json({
        error: 'Unable to create organization with that name. Please try again.',
        code: 'ORGANIZATION_CONFLICT',
      });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── LOGIN ───────────────────────────────────────────────────
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, mfaCode } = req.body;
    const { ipAddress, userAgent } = getClientInfo(req);

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organization: true,
        memberships: { include: { workspace: true }, take: 1 },
      },
    });

    if (!user) {
      // No audit log here: we have no real orgId for an unknown email,
      // and the audit_logs.orgId FK is non-nullable. The failed attempt
      // is already visible in the response status + brute-force counter.
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    // Brute force check
    const { locked, remainingAttempts } = await checkBruteForce(user.id);
    if (locked) {
      res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await recordLoginAttempt(user.id, false);
      await safeAuditLog({
        orgId: user.orgId, userId: user.id, action: 'LOGIN_FAILED', resource: 'user', resourceId: user.id, details: { reason: 'invalid_password', remainingAttempts: remainingAttempts - 1 }, ipAddress, userAgent, severity: 'MEDIUM',
      });
      res.status(401).json({ error: `Invalid credentials. ${remainingAttempts - 1} attempts remaining.` });
      return;
    }

    // MFA check
    if (user.mfaEnabled) {
      if (!mfaCode) {
        res.json({ mfaRequired: true, userId: user.id });
        return;
      }
      const validMFA = verifyTOTP(user.mfaSecret || '', mfaCode);
      if (!validMFA) {
        res.status(401).json({ error: 'Invalid MFA code' });
        return;
      }
    }

    await recordLoginAttempt(user.id, true);

    // Get default workspace
    const membership = user.memberships[0];
    const defaultWorkspace = membership?.workspace;

    const tokens = await issueAuthSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      orgName: user.organization.name,
      workspaceId: defaultWorkspace?.id,
      environmentId: null,
    }, { ipAddress, userAgent });

    await safeAuditLog({
      orgId: user.orgId, userId: user.id, action: 'LOGIN', resource: 'user', resourceId: user.id, details: {}, ipAddress, userAgent,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        title: user.title,
        org: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, plan: user.organization.plan },
        workspace: defaultWorkspace ? { id: defaultWorkspace.id, name: defaultWorkspace.name } : null,
        mfaEnabled: user.mfaEnabled,
        emailVerified: user.emailVerified,
        preferences: user.preferences,
      },
      ...tokens,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REFRESH TOKEN ──────────────────────────────────────────
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const decoded = verifyRefreshToken(refreshToken);
    const validSession = await validateSession(decoded.sid, decoded.st);
    if (!validSession) {
      res.status(401).json({ error: 'Refresh session expired or revoked' });
      return;
    }
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { 
        organization: true, 
        memberships: { 
          include: { workspace: true },
          orderBy: { joinedAt: 'asc' },
        } 
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    // Determine active workspace from header or default to first membership
    const requestedWorkspaceId = req.headers['x-workspace-id'] as string;
    let activeMembership = user.memberships[0];
    
    if (requestedWorkspaceId) {
      activeMembership = user.memberships.find(m => m.workspaceId === requestedWorkspaceId) || activeMembership;
    }

    const tokens = await issueAuthSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: activeMembership?.role || user.role,
      orgId: user.orgId,
      orgName: user.organization.name,
      workspaceId: activeMembership?.workspace?.id,
      environmentId: null,
    }, getClientInfo(req));

    // Revoke old session if token was provided
    try {
      await revokeSession(decoded.sid);
    } catch { /* old token may already be invalid */ }

    res.json({
      ...tokens,
      workspace: activeMembership?.workspace ? {
        id: activeMembership.workspace.id,
        name: activeMembership.workspace.name,
        slug: activeMembership.workspace.slug,
      } : null,
    });
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ─── LOGOUT ─────────────────────────────────────────────────
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // Revoke all sessions for this user if possible
      try {
        const decoded = verifyAccessToken(token);
        if (decoded.sid) {
          await revokeSession(decoded.sid);
        } else {
          await revokeAllUserSessions(decoded.userId);
        }
      } catch { /* token already expired */ }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MFA SETUP ──────────────────────────────────────────────
authRouter.post('/mfa/setup', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { secret, otpauthUrl } = generateMFASecret();
    const backupCodes = generateBackupCodes();

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        mfaSecret: secret,
        mfaMethod: 'TOTP',
        mfaBackupCodes: backupCodes.map((code) => ({ code, used: false })),
      },
    });

    await safeAuditLog({
      orgId: req.user!.orgId, userId: req.user!.userId, action: 'MFA_ENABLED', resource: 'user', resourceId: req.user!.userId, details: { method: 'TOTP' },
    });

    res.json({ secret, otpauthUrl, backupCodes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MFA VERIFY & ENABLE ────────────────────────────────────
authRouter.post('/mfa/verify', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user?.mfaSecret) {
      res.status(400).json({ error: 'MFA not initialized' });
      return;
    }

    if (!verifyTOTP(user.mfaSecret, code)) {
      res.status(400).json({ error: 'Invalid code' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true },
    });

    res.json({ enabled: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MFA DISABLE ────────────────────────────────────────────
authRouter.post('/mfa/disable', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });

    if (user?.mfaEnabled) {
      if (!user.mfaSecret || !verifyTOTP(user.mfaSecret, code)) {
        res.status(400).json({ error: 'Invalid MFA code' });
        return;
      }
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    });

    await safeAuditLog({
      orgId: req.user!.orgId, userId: req.user!.userId, action: 'MFA_DISABLED', resource: 'user', resourceId: req.user!.userId,
    });

    res.json({ disabled: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VERIFY EMAIL ───────────────────────────────────────────
authRouter.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const user = await prisma.user.findFirst({ where: { emailVerificationToken: token } });
    if (!user) {
      res.status(400).json({ error: 'Invalid verification token' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null },
    });

    res.json({ verified: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FORGOT PASSWORD ────────────────────────────────────────
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetToken = generatePasswordResetToken();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });
      // In production: send email with reset link
    }
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RESET PASSWORD ─────────────────────────────────────────
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await revokeAllUserSessions(user.id);

    await safeAuditLog({
      orgId: user.orgId, userId: user.id, action: 'LOGIN', resource: 'user', resourceId: user.id, details: { event: 'password_reset' },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ME ─────────────────────────────────────────────────────
authRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        organization: { select: { id: true, name: true, slug: true, plan: true, industry: true, logo: true, settings: true, features: true } },
        memberships: {
          include: { workspace: { include: { environments: { select: { id: true, name: true, slug: true, type: true } } } } },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      title: user.title,
      avatar: user.avatar,
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified,
      preferences: user.preferences,
      lastLoginAt: user.lastLoginAt,
      organization: user.organization,
      permissions: req.user!.permissions,
      activeEnvironment: user.memberships
        .flatMap((membership) => membership.workspace.environments)
        .find((environment) => environment.id === req.user!.environmentId) || null,
      workspaces: user.memberships.map((m) => ({ ...m.workspace, role: m.role, permissions: m.permissions })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE PROFILE ─────────────────────────────────────────
authRouter.patch('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, title, preferences } = req.body;
    const data: any = {};
    if (name) data.name = name;
    if (title) data.title = title;
    if (preferences) data.preferences = preferences;

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: { id: true, email: true, name: true, title: true, preferences: true },
    });

    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CHANGE PASSWORD ────────────────────────────────────────
authRouter.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) { res.status(400).json({ error: 'Current password is incorrect' }); return; }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character',
      });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await revokeAllUserSessions(user.id);

    res.json({ message: 'Password changed. Please log in again.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SWITCH WORKSPACE ────────────────────────────────────────
authRouter.post('/switch-workspace', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user!.userId, workspaceId },
      include: { workspace: true },
    });

    if (!membership) {
      res.status(403).json({ error: 'Not a member of this workspace' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { organization: true },
    });

    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const tokens = await issueAuthSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
      orgId: user.orgId,
      orgName: user.organization.name,
      workspaceId: membership.workspace.id,
      environmentId: null,
    }, getClientInfo(req));

    res.json({
      workspace: { id: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug },
      role: membership.role,
      ...tokens,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/switch-environment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { environmentId } = req.body;
    const environment = await prisma.environment.findFirst({
      where: { id: environmentId },
      include: { workspace: true },
    });
    if (!environment) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user!.userId, workspaceId: environment.workspaceId },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this environment workspace' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { organization: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const tokens = await issueAuthSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
      orgId: user.orgId,
      orgName: user.organization.name,
      workspaceId: environment.workspaceId,
      environmentId: environment.id,
    }, getClientInfo(req));
    res.json({
      environment: {
        id: environment.id,
        name: environment.name,
        slug: environment.slug,
        type: environment.type,
      },
      workspace: environment.workspace,
      role: membership.role,
      ...tokens,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.userId },
      orderBy: { lastActiveAt: 'desc' },
    });
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/sessions/:id/revoke', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id);
    await prisma.session.updateMany({
      where: { id: sessionId, userId: req.user!.userId },
      data: { status: 'REVOKED' },
    });
    res.json({ revoked: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
