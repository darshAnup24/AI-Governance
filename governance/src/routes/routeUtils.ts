import type { Request, Response } from "express";

import { getTraceId, logRouteError } from "../platform/requestContext";

export function sendRouteError(
  res: Response,
  req: Request,
  scope: string,
  error: unknown,
  status = 500,
) {
  const traceId = getTraceId(req);
  logRouteError(scope, error, traceId);
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : error instanceof Error ? error.message : String(error),
    trace_id: traceId,
  });
}
