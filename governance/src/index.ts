import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { modelsRouter } from "./routes/models";
import { risksRouter } from "./routes/risks";
import { complianceRouter } from "./routes/compliance";
import { incidentsRouter } from "./routes/incidents";
import { policiesRouter } from "./routes/policies";
import { vendorsRouter } from "./routes/vendors";
import { datasetsRouter } from "./routes/datasets";
import { threatsRouter } from "./routes/threats";
import { advisorRouter } from "./routes/advisor";
import { reportsRouter } from "./routes/reports";
import { auditRouter } from "./routes/audit";
import { usersRouter } from "./routes/users";
import { internalRouter } from "./routes/internal";
import { apiKeysRouter } from "./routes/apiKeys";
import { organizationsRouter } from "./routes/organizations";
import { invitationsRouter } from "./routes/invitations";
import { providersRouter } from "./routes/providers";
import { settingsRouter } from "./routes/settings";
import { connectRedis } from "./engine/redisEnrichment";
import { authMiddleware, requireGovernanceScope } from "./middleware/auth";
import { auditMiddleware } from "./middleware/auditLogger";
import { workspaceContextMiddleware, validateWorkspaceAccess } from "./middleware/workspace";
import { prisma } from "./platform/prisma";
export { prisma };

const app = express();
const PORT = process.env.GOVERNANCE_PORT || 4000;

// ─── Global Middleware ───────────────────────────────────
app.use(helmet());
app.use(cors({ 
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3002").split(","), 
    credentials: true 
}));
app.use(express.json({ limit: "10mb" }));
app.use(
    rateLimit({
        windowMs: 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false,
    })
);

// ─── Health ──────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "healthy", service: "governance", version: "0.1.0" });
});

// ─── Public Routes ───────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/governance/auth", authRouter);

// ─── Internal Service Routes (service token, no user JWT) ────────────────────
app.use("/api/internal", internalRouter);

// ─── Protected Routes ────────────────────────────────────
app.use("/api/dashboard", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, dashboardRouter);
app.use("/api/models", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, modelsRouter);
app.use("/api/risks", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, risksRouter);
app.use("/api/compliance", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, complianceRouter);
app.use("/api/incidents", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, incidentsRouter);
app.use("/api/policies", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, policiesRouter);
app.use("/api/vendors", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, vendorsRouter);
app.use("/api/datasets", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, datasetsRouter);
app.use("/api/threats", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, threatsRouter);
app.use("/api/advisor", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, advisorRouter);
app.use("/api/reports", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, reportsRouter);
app.use("/api/audit-logs", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditRouter);
app.use("/api/users", authMiddleware, requireGovernanceScope, auditMiddleware, usersRouter);
app.use("/api/api-keys", authMiddleware, requireGovernanceScope, workspaceContextMiddleware, validateWorkspaceAccess, auditMiddleware, apiKeysRouter);
app.use("/api/organization", authMiddleware, requireGovernanceScope, organizationsRouter);
app.use("/api/invitations", authMiddleware, requireGovernanceScope, auditMiddleware, invitationsRouter);
app.use("/api/providers", authMiddleware, requireGovernanceScope, providersRouter);
app.use("/api/settings", authMiddleware, requireGovernanceScope, settingsRouter);

// ─── Error Handler ───────────────────────────────────────
app.use(
    (
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
    ) => {
        console.error("Unhandled error:", err);
        res
            .status(500)
            .json({ error: "Internal server error", detail: err.message });
    }
);

// ─── Start ───────────────────────────────────────────────
(async () => {
    await Promise.all([
      connectRedis().catch((err: Error) => console.warn("[startup] Redis connect failed:", err.message)),
    ]);
    app.listen(PORT, () => {
        console.log(`🛡️  Airlock Governance API running on port ${PORT}`);
    });
})();

export default app;
