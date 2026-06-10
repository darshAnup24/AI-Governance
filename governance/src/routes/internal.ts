import { Router, Request, Response, NextFunction } from "express";
import { serviceRegistry } from "../platform/serviceRegistry";
import { getRequiredSecret } from "../platform/runtimeConfig";
import { generateIncidentAdvisorSummary } from "./advisor";
import { getTraceId } from "../platform/requestContext";
import { sendRouteError } from "./routeUtils";

export const internalRouter = Router();

const SERVICE_TOKEN = getRequiredSecret(
    ["INTERNAL_SERVICE_TOKEN"],
    "internal-service-token-change-me",
    "Internal service token",
);

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

internalRouter.post("/incidents", serviceAuth, async (req: Request, res: Response) => {
    try {
        const traceId = String(req.body?.traceId || getTraceId(req));
        const orgId = String(req.body?.orgId || "");
        const userId = String(req.body?.userId || "");

        if (!orgId || !userId || !req.body?.title) {
            res.status(400).json({ error: "orgId, userId, and title are required", trace_id: traceId });
            return;
        }

        const incident = await serviceRegistry.incidents.createIncident({
            orgId,
            userId,
            title: String(req.body.title),
            description: String(req.body?.description || ""),
            severity: String(req.body?.severity || "MEDIUM"),
            modelId: req.body?.modelId ? String(req.body.modelId) : null,
            workspaceId: req.body?.workspaceId ? String(req.body.workspaceId) : null,
            environmentId: req.body?.environmentId ? String(req.body.environmentId) : null,
            traceId,
        });

        res.json(incident);
    } catch (err) {
        sendRouteError(res, req, "internal.incidents.create", err);
    }
});

internalRouter.post("/advisor/incident-summary", serviceAuth, async (req: Request, res: Response) => {
    try {
        const traceId = String(req.body?.traceId || getTraceId(req));
        const orgId = String(req.body?.orgId || "");
        if (!orgId) {
            res.status(400).json({ error: "orgId is required", trace_id: traceId });
            return;
        }

        const summary = await generateIncidentAdvisorSummary({
            orgId,
            userId: req.body?.userId ? String(req.body.userId) : null,
            traceId,
            incidentType: String(req.body?.incidentType || "policy_violation"),
            severity: String(req.body?.severity || "MEDIUM"),
            offendingPrompt: String(req.body?.offendingPrompt || ""),
            detectionEvidence:
                req.body?.detectionEvidence && typeof req.body.detectionEvidence === "object"
                    ? req.body.detectionEvidence
                    : {},
            violatedPolicy: String(req.body?.violatedPolicy || "Unspecified policy"),
            incidentId: req.body?.incidentId ? String(req.body.incidentId) : null,
        });

        res.json(summary);
    } catch (err) {
        sendRouteError(res, req, "internal.advisor.incident-summary", err);
    }
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
