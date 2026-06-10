import { randomUUID } from "crypto";
import type { Request, Response } from "express";

export function getTraceId(req: Request): string {
  return req.traceId || String(req.headers["x-trace-id"] || req.headers["x-request-id"] || randomUUID());
}

export function attachTraceId(req: Request, res: Response): string {
  const traceId = getTraceId(req);
  req.traceId = traceId;
  res.setHeader("X-Trace-ID", traceId);
  return traceId;
}

export function logRouteError(scope: string, error: unknown, traceId: string) {
  console.error(`[${scope}]`, {
    traceId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}
