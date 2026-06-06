import { Router, Request, Response, NextFunction } from "express";
import { serviceRegistry } from "../platform/serviceRegistry";

export const internalRouter = Router();

const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "internal-service-token-change-me";

function serviceAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers["x-service-token"] || req.headers["authorization"];
    const token = typeof header === "string"
        ? header.replace(/^Bearer\s+/i, "")
        : "";
    if (token !== SERVICE_TOKEN) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
}

// GET /api/internal/policies?org_id=<id>
// Used by the proxy service to fetch org policies without a user JWT.
internalRouter.get("/policies", serviceAuth, async (req: Request, res: Response) => {
    try {
        const orgId = req.query.org_id as string;
        if (!orgId) {
            res.status(400).json({ error: "org_id query param required" });
            return;
        }
        const policies = await serviceRegistry.policies.listForInternalFetch(orgId);
        res.json(policies);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

internalRouter.get("/services", serviceAuth, (_req: Request, res: Response) => {
    res.json({
        gateway: "governance",
        services: serviceRegistry.describe(),
    });
});

internalRouter.get("/workflow-jobs/:jobId", serviceAuth, async (req: Request, res: Response) => {
    try {
        const job = await serviceRegistry.reports.getJobStatus(req.params.jobId as string);
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        res.json(job);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
