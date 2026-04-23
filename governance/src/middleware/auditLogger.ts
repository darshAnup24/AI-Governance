import { Request, Response, NextFunction } from "express";
import { prisma } from "../index";

export async function auditMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
): Promise<void> {
    // Only audit mutations
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        try {
            const entity = req.baseUrl.split("/").pop() || "unknown";
            await prisma.auditLog.create({
                data: {
                    orgId: req.user?.orgId || "",
                    userId: req.user?.userId || null,
                    action: req.method,
                    entity,
                    entityId: req.params.id as string || null,
                    metadata: {
                        path: req.originalUrl,
                        ip: req.ip,
                        userAgent: req.headers["user-agent"] || "",
                    },
                },
            });
        } catch (err) {
            // Non-blocking: don't fail the request if audit fails
            console.error("Audit log failed:", err);
        }
    }
    next();
}
