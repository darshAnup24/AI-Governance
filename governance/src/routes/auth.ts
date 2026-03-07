import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../index";
import { signToken, JWT_SECRET, AuthUser } from "../middleware/auth";

export const authRouter = Router();

// POST /api/auth/register
authRouter.post("/register", async (req: Request, res: Response) => {
    try {
        const { email, password, name, orgName } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Email and password required" });
            return;
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ error: "Email already registered" });
            return;
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // Create or find org
        let org = await prisma.organization.findFirst({
            where: { name: orgName || "Default Org" },
        });
        if (!org) {
            org = await prisma.organization.create({
                data: { name: orgName || "Default Org", plan: "FREE" },
            });
        }

        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name: name || "",
                role: "ADMIN", // First user becomes admin
                orgId: org.id,
            },
        });

        const tokens = signToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            orgId: user.orgId,
        });

        res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, ...tokens });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/login
authRouter.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Email and password required" });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { organization: true },
        });
        if (!user) {
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }

        const tokens = signToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            orgId: user.orgId,
        });

        // Audit login
        await prisma.auditLog.create({
            data: {
                orgId: user.orgId,
                userId: user.id,
                action: "LOGIN",
                entity: "user",
                entityId: user.id,
            },
        });

        res.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                org: { id: user.organization.id, name: user.organization.name, plan: user.organization.plan },
            },
            ...tokens,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/refresh
authRouter.post("/refresh", async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({ error: "Refresh token required" });
            return;
        }

        const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
        if (decoded.type !== "refresh") {
            res.status(401).json({ error: "Invalid refresh token" });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
        });
        if (!user) {
            res.status(401).json({ error: "User not found" });
            return;
        }

        const tokens = signToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            orgId: user.orgId,
        });

        res.json(tokens);
    } catch (err: any) {
        res.status(401).json({ error: "Invalid refresh token" });
    }
});

// POST /api/auth/logout
authRouter.post("/logout", (_req: Request, res: Response) => {
    // Stateless JWT — client discards tokens
    res.json({ message: "Logged out" });
});
