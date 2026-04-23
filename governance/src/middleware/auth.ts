import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "shieldai-dev-secret-change-me";

export interface AuthUser {
    userId: string;
    email: string;
    role: string;
    orgId: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
        return;
    }

    const token = header.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
    }
}

export function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: "Insufficient permissions" });
            return;
        }
        next();
    };
}

export function signToken(user: AuthUser): {
    accessToken: string;
    refreshToken: string;
} {
    const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: "1h" });
    const refreshToken = jwt.sign(
        { userId: user.userId, type: "refresh" },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
    return { accessToken, refreshToken };
}

export { JWT_SECRET };
