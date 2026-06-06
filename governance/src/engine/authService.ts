import crypto from "crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";

import { prisma } from "../index";
import { resolveAuthorizationContext } from "./rbacEngine";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.GOVERNANCE_JWT_SECRET ||
  "airlock-enterprise-secret-change-me";
const REFRESH_SECRET =
  process.env.REFRESH_SECRET ||
  process.env.GOVERNANCE_REFRESH_SECRET ||
  "airlock-refresh-secret-change-me";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  orgId: string;
  orgName: string;
  workspaceId?: string | null;
  environmentId?: string | null;
  scope?: string;
}

export interface AccessTokenClaims {
  userId: string;
  email: string;
  name: string;
  role: string;
  orgId: string;
  orgName: string;
  workspaceId?: string;
  environmentId?: string;
  permissions: string[];
  membershipRoles: Record<string, string>;
  scope: string;
  sid: string;
}

export interface RefreshTokenClaims {
  userId: string;
  type: "refresh";
  sid: string;
  st: string;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  deviceName?: string,
) {
  return prisma.session.create({
    data: {
      userId,
      token: crypto.randomBytes(48).toString("hex"),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      deviceName: deviceName || inferDeviceName(userAgent),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
}

export async function validateSession(
  sessionId: string,
  sessionToken?: string,
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.status !== "ACTIVE") {
    return null;
  }
  if (sessionToken && session.token !== sessionToken) {
    return null;
  }
  if (session.expiresAt < new Date()) {
    await prisma.session.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    return null;
  }
  return session;
}

export async function touchSession(
  sessionId: string,
  metadata?: { ipAddress?: string; userAgent?: string },
) {
  await prisma.session.updateMany({
    where: { id: sessionId, status: "ACTIVE" },
    data: {
      lastActiveAt: new Date(),
      ipAddress: metadata?.ipAddress || undefined,
      userAgent: metadata?.userAgent || undefined,
    },
  });
}

export async function revokeSession(sessionIdOrToken: string) {
  await prisma.session.updateMany({
    where: {
      OR: [{ id: sessionIdOrToken }, { token: sessionIdOrToken }],
      status: "ACTIVE",
    },
    data: { status: "REVOKED" },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "REVOKED" },
  });
}

export async function generateTokenPair(
  user: SessionUser,
  session: { id: string; token: string },
) {
  const authz = await resolveAuthorizationContext({
    userId: user.userId,
    orgId: user.orgId,
    workspaceId: user.workspaceId || undefined,
    environmentId: user.environmentId || undefined,
  });

  const accessClaims: AccessTokenClaims = {
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: authz.activeRole || user.role,
    orgId: user.orgId,
    orgName: user.orgName,
    workspaceId: authz.activeWorkspaceId || undefined,
    environmentId: authz.activeEnvironmentId || undefined,
    permissions: authz.permissions,
    membershipRoles: authz.membershipRoles,
    scope: user.scope || "governance",
    sid: session.id,
  };

  const refreshClaims: RefreshTokenClaims = {
    userId: user.userId,
    type: "refresh",
    sid: session.id,
    st: session.token,
  };

  const accessToken = jwt.sign(accessClaims, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
  const refreshToken = jwt.sign(refreshClaims, REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, authz };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, JWT_SECRET) as AccessTokenClaims;
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  return jwt.verify(token, REFRESH_SECRET) as RefreshTokenClaims;
}

export async function issueAuthSession(
  user: SessionUser,
  client: { ipAddress?: string; userAgent?: string; deviceName?: string },
) {
  const session = await createSession(
    user.userId,
    client.ipAddress,
    client.userAgent,
    client.deviceName,
  );
  return generateTokenPair(user, { id: session.id, token: session.token });
}

export function generateMFASecret() {
  const secret = crypto.randomBytes(20).toString("hex");
  const otpauthUrl = `otpauth://totp/Airlock:${secret}?secret=${secret}&issuer=Airlock`;
  return { secret, otpauthUrl };
}

export function verifyTOTP(secret: string, token: string): boolean {
  if (!secret || !token || token.length !== 6) {
    return false;
  }
  const timeStep = 30;
  const now = Math.floor(Date.now() / 1000);
  for (let offset = -1; offset <= 1; offset += 1) {
    const counter = Math.floor(now / timeStep) + offset;
    if (generateTOTP(secret, counter) === token) {
      return true;
    }
  }
  return false;
}

function generateTOTP(secret: string, counter: number) {
  const hmac = crypto.createHmac("sha1", secret);
  hmac.update(Buffer.from(counter.toString(16).padStart(16, "0"), "hex"));
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export function generateBackupCodes() {
  return Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase(),
  );
}

export function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function generatePasswordResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function checkBruteForce(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { locked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { locked: true, remainingAttempts: 0 };
  }
  if (user.lockedUntil && user.lockedUntil <= new Date()) {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    return { locked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }
  return {
    locked: false,
    remainingAttempts: Math.max(
      0,
      MAX_LOGIN_ATTEMPTS - user.failedLoginAttempts,
    ),
  };
}

export async function recordLoginAttempt(
  userId: string,
  success: boolean,
  context?: { ipAddress?: string },
) {
  if (success) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: context?.ipAddress || undefined,
      },
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const attempts = (user?.failedLoginAttempts || 0) + 1;
  await prisma.user.update({
    where: { id: userId },
    data:
      attempts >= MAX_LOGIN_ATTEMPTS
        ? {
            failedLoginAttempts: attempts,
            lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
          }
        : { failedLoginAttempts: attempts },
  });
}

export function generateInvitationToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function generateAPIKey() {
  const raw = `sk_live_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

function inferDeviceName(userAgent?: string) {
  if (!userAgent) {
    return "Unknown Device";
  }
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Safari")) return "Safari";
  return "Browser Session";
}
