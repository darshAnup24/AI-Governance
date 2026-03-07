import { Router, Request, Response } from "express";
import { prisma } from "../index";
import { v4 as uuidv4 } from "uuid";

export const advisorRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

// POST /api/advisor/chat — Streaming response from Ollama
advisorRouter.post("/chat", async (req: Request, res: Response) => {
    try {
        const { message, sessionId } = req.body;
        if (!message) {
            res.status(400).json({ error: "message required" });
            return;
        }

        const sid = sessionId || uuidv4();
        const orgId = req.user!.orgId;
        const userId = req.user!.userId;

        // Fetch org context for system prompt
        const [incidents, models, complianceChecks] = await Promise.all([
            prisma.incident.count({ where: { orgId, status: { not: "RESOLVED" } } }),
            prisma.aIModel.count({ where: { orgId } }),
            prisma.complianceCheck.findMany({
                where: { orgId },
                select: { framework: true, score: true },
            }),
        ]);

        const avgCompliance =
            complianceChecks.length > 0
                ? Math.round(complianceChecks.reduce((s, c) => s + c.score, 0) / complianceChecks.length)
                : 0;

        // Get conversation history
        const history = await prisma.advisorMessage.findMany({
            where: { sessionId: sid, orgId },
            orderBy: { createdAt: "asc" },
            take: 20,
        });

        const systemPrompt = `You are ShieldAI Advisor, an expert AI governance consultant specializing in EU AI Act, ISO 42001, NIST AI RMF, and ISO 27001. You run entirely on-premise — no data ever leaves this system. Always cite specific regulation articles. Be concise and actionable.

Current org context:
- AI Models registered: ${models}
- Active incidents: ${incidents}
- Average compliance score: ${avgCompliance}%
- Compliance by framework: ${complianceChecks.map((c) => `${c.framework}: ${c.score}%`).join(", ") || "None"}`;

        const messages = [
            ...history.map((m) => `${m.role === "USER" ? "User" : "Assistant"}: ${m.content}`),
            `User: ${message}`,
        ].join("\n\n");

        // Save user message
        await prisma.advisorMessage.create({
            data: { orgId, userId, sessionId: sid, role: "USER", content: message },
        });

        // Stream from Ollama
        const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                system: systemPrompt,
                prompt: messages,
                stream: true,
            }),
        });

        if (!ollamaRes.ok || !ollamaRes.body) {
            res.status(502).json({ error: "Ollama unavailable" });
            return;
        }

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Session-Id", sid);

        let fullResponse = "";
        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n").filter((l) => l.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.response) {
                            fullResponse += data.response;
                            res.write(`data: ${JSON.stringify({ token: data.response, sessionId: sid })}\n\n`);
                        }
                        if (data.done) {
                            res.write(`data: ${JSON.stringify({ done: true, sessionId: sid })}\n\n`);
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } catch (streamErr) {
            console.error("Stream error:", streamErr);
        }

        // Save assistant message
        if (fullResponse) {
            await prisma.advisorMessage.create({
                data: {
                    orgId,
                    userId,
                    sessionId: sid,
                    role: "ASSISTANT",
                    content: fullResponse,
                },
            });
        }

        res.end();
    } catch (err: any) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// GET /api/advisor/history
advisorRouter.get("/history", async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.query;
        const where: any = { orgId: req.user!.orgId, userId: req.user!.userId };
        if (sessionId) where.sessionId = sessionId;

        const messages = await prisma.advisorMessage.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: 100,
        });
        res.json(messages);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
