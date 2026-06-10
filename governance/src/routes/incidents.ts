import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { serviceRegistry } from "../platform/serviceRegistry";
import { getTraceId } from "../platform/requestContext";
import { sendRouteError } from "./routeUtils";

export const incidentsRouter = Router();

// ─── Status Transition Validation ───────────────────────────
// GET /api/incidents/stats — Incident statistics
incidentsRouter.get("/stats", async (req: Request, res: Response) => {
    try {
        const stats = await serviceRegistry.incidents.getStats(
            req.user!.orgId,
            req.query.workspaceId as string | undefined,
        );
        res.json(stats);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.stats", err);
    }
});

// GET /api/incidents — List incidents (filterable by status, severity, workspaceId)
incidentsRouter.get("/", async (req: Request, res: Response) => {
    try {
        const incidents = await serviceRegistry.incidents.list(req.user!.orgId, req.query as any);
        res.json(incidents);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.list", err);
    }
});

// GET /api/incidents/:id — Single incident with full relations
incidentsRouter.get("/:id", async (req: Request, res: Response) => {
    try {
        const incident = await serviceRegistry.incidents.getById(
            req.params.id as string,
            req.user!.orgId,
        );
        if (!incident) {
            res.status(404).json({ error: "Incident not found" });
            return;
        }
        res.json(incident);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.getById", err);
    }
});

// POST /api/incidents — Create a new incident
incidentsRouter.post("/", async (req: Request, res: Response) => {
    try {
        const { title, description, severity, modelId, workspaceId, environmentId } = req.body;
        const incident = await serviceRegistry.incidents.createIncident({
            orgId: req.user!.orgId,
            userId: req.user!.userId,
            title,
            description,
            severity,
            modelId,
            workspaceId: workspaceId || null,
            environmentId: environmentId || null,
            traceId: getTraceId(req),
        });
        res.json(incident);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.create", err);
    }
});

// PUT /api/incidents/:id — Update incident fields
incidentsRouter.put("/:id", async (req: Request, res: Response) => {
    try {
        const { title, description, severity, resolution, rootCause } = req.body;
        const data: any = {};
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (severity !== undefined) data.severity = severity;
        if (resolution !== undefined) data.resolution = resolution;
        if (rootCause !== undefined) data.rootCause = rootCause;

        await prisma.incident.updateMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            data,
        });
        const updated = await prisma.incident.findFirst({
            where: { id: req.params.id as string },
            include: {
                assignee: { select: { id: true, name: true, email: true } },
                model: { select: { name: true } },
            },
        });
        res.json(updated);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.update", err);
    }
});

// PATCH /api/incidents/:id/status — Update status + validate transition + auto-create timeline event
incidentsRouter.patch("/:id/status", async (req: Request, res: Response) => {
    try {
        const { status, resolution, rootCause } = req.body;

        // Fetch current incident
        const current = await prisma.incident.findFirst({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        if (!current) {
            res.status(404).json({ error: 'Incident not found' });
            return;
        }

        // Validate transition
        const transition = serviceRegistry.incidents.validateStatusTransition(current.status, status);
        if (!transition.valid) {
            res.status(400).json({ error: transition.error });
            return;
        }

        const data: any = { status };
        if (status === 'RESOLVED_CLOSED') {
            data.resolvedAt = new Date();
            if (resolution) data.resolution = resolution;
            if (rootCause) data.rootCause = rootCause;
        }
        if (status === 'ACKNOWLEDGED') data.acknowledgedAt = new Date();

        await prisma.incident.updateMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            data,
        });

        await prisma.incidentEvent.create({
            data: {
                incidentId: req.params.id as string,
                traceId: getTraceId(req),
                eventType: 'STATUS_CHANGE',
                payload: {
                    from: current.status,
                    to: status,
                    changedBy: req.user!.userId,
                    traceId: getTraceId(req),
                    resolution: resolution || undefined,
                    rootCause: rootCause || undefined,
                },
                createdBy: req.user!.userId,
            },
        });

        const updated = await prisma.incident.findFirst({
            where: { id: req.params.id as string },
            include: {
                model: { select: { name: true } },
                assignee: { select: { id: true, name: true, email: true } },
            },
        });
        res.json(updated);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.status", err);
    }
});

// POST /api/incidents/:id/assign — Assign incident to a user
incidentsRouter.post("/:id/assign", async (req: Request, res: Response) => {
    try {
        const { userId } = req.body;
        const user = await prisma.user.findFirst({
            where: { id: userId, orgId: req.user!.orgId },
        });
        if (!user) {
            res.status(404).json({ error: "User not found in your organization" });
            return;
        }

        await prisma.incident.updateMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            data: { assignedTo: userId },
        });

        await prisma.incidentEvent.create({
            data: {
                incidentId: req.params.id as string,
                traceId: getTraceId(req),
                eventType: "ASSIGNED",
                payload: { assignedTo: userId, assignedByName: user.name, assignedBy: req.user!.userId, traceId: getTraceId(req) },
                createdBy: req.user!.userId,
            },
        });

        const updated = await prisma.incident.findFirst({
            where: { id: req.params.id as string },
            include: { assignee: { select: { id: true, name: true, email: true } } },
        });
        res.json(updated);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.assign", err);
    }
});

// POST /api/incidents/:id/escalate — Escalate incident to another user
incidentsRouter.post("/:id/escalate", async (req: Request, res: Response) => {
    try {
        const { userId } = req.body;
        const user = await prisma.user.findFirst({
            where: { id: userId, orgId: req.user!.orgId },
        });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        await prisma.incident.updateMany({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
            data: { escalatedTo: userId, escalatedAt: new Date() },
        });

        await prisma.incidentEvent.create({
            data: {
                incidentId: req.params.id as string,
                traceId: getTraceId(req),
                eventType: "ESCALATED",
                payload: { escalatedTo: userId, escalatedByName: user.name, escalatedBy: req.user!.userId, traceId: getTraceId(req) },
                createdBy: req.user!.userId,
            },
        });

        const updated = await prisma.incident.findFirst({
            where: { id: req.params.id as string },
            include: { escalation: { select: { id: true, name: true, email: true } } },
        });
        res.json(updated);
    } catch (err: any) {
        sendRouteError(res, req, "incidents.escalate", err);
    }
});

// POST /api/incidents/:id/evidence — Add evidence item
incidentsRouter.post("/:id/evidence", async (req: Request, res: Response) => {
    try {
        const { type, content, label } = req.body;
        const incident = await prisma.incident.findFirst({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        if (!incident) {
            res.status(404).json({ error: "Incident not found" });
            return;
        }

        const evidence = (incident.evidence as any[]) || [];
        const newItem = {
            id: crypto.randomUUID(),
            type: type || "note",
            content,
            label: label || "",
            addedBy: req.user!.userId,
            addedAt: new Date().toISOString(),
        };
        evidence.push(newItem);

        await prisma.incident.update({
            where: { id: req.params.id as string },
            data: { evidence },
        });

        await prisma.incidentEvent.create({
            data: {
                incidentId: req.params.id as string,
                eventType: "EVIDENCE_ADDED",
                payload: { evidenceId: newItem.id, type, label },
                createdBy: req.user!.userId,
            },
        });

        res.json(newItem);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/incidents/:id/evidence/:evidenceId — Remove evidence item
incidentsRouter.delete("/:id/evidence/:evidenceId", async (req: Request, res: Response) => {
    try {
        const incident = await prisma.incident.findFirst({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        if (!incident) {
            res.status(404).json({ error: "Incident not found" });
            return;
        }

        const evidence = (incident.evidence as any[]).filter(
            (e: any) => e.id !== req.params.evidenceId
        );

        await prisma.incident.update({
            where: { id: req.params.id as string },
            data: { evidence },
        });

        await prisma.incidentEvent.create({
            data: {
                incidentId: req.params.id as string,
                eventType: "EVIDENCE_REMOVED",
                payload: { evidenceId: req.params.evidenceId },
                createdBy: req.user!.userId,
            },
        });

        res.json({ deleted: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/incidents/:id/events — Incident timeline events
incidentsRouter.get("/:id/events", async (req: Request, res: Response) => {
    try {
        const incident = await prisma.incident.findFirst({
            where: { id: req.params.id as string, orgId: req.user!.orgId },
        });
        if (!incident) {
            res.status(404).json({ error: "Incident not found" });
            return;
        }
        const events = await prisma.incidentEvent.findMany({
            where: { incidentId: req.params.id as string },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        res.json(events);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
