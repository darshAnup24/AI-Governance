import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
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
import { authMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/auditLogger";

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.GOVERNANCE_PORT || 4000;

// ─── Global Middleware ───────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
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

// ─── Protected Routes ────────────────────────────────────
app.use("/api/dashboard", authMiddleware, auditMiddleware, dashboardRouter);
app.use("/api/models", authMiddleware, auditMiddleware, modelsRouter);
app.use("/api/risks", authMiddleware, auditMiddleware, risksRouter);
app.use("/api/compliance", authMiddleware, auditMiddleware, complianceRouter);
app.use("/api/incidents", authMiddleware, auditMiddleware, incidentsRouter);
app.use("/api/policies", authMiddleware, auditMiddleware, policiesRouter);
app.use("/api/vendors", authMiddleware, auditMiddleware, vendorsRouter);
app.use("/api/datasets", authMiddleware, auditMiddleware, datasetsRouter);
app.use("/api/threats", authMiddleware, auditMiddleware, threatsRouter);
app.use("/api/advisor", authMiddleware, advisorRouter);
app.use("/api/reports", authMiddleware, auditMiddleware, reportsRouter);
app.use("/api/audit-logs", authMiddleware, auditRouter);

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
app.listen(PORT, () => {
    console.log(`🛡️  ShieldAI Governance API running on port ${PORT}`);
});

export default app;
