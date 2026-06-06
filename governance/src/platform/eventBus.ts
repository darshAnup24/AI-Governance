import type Redis from "ioredis";

import { connectRedis } from "../engine/redisEnrichment";

export type GovernanceEventStream =
  | "audit_events"
  | "incident_events"
  | "telemetry_events"
  | "policy_events"
  | "detection_events";

export type GovernanceEventPayload = {
  stream: GovernanceEventStream;
  eventType: string;
  orgId: string;
  workspaceId?: string | null;
  environmentId?: string | null;
  traceId?: string | null;
  payload: Record<string, unknown>;
  eventId?: string;
  version?: string;
  idempotencyKey?: string;
};

export class GovernanceEventBus {
  private redisPromise: Promise<Redis> | null = null;

  async publish(event: GovernanceEventPayload): Promise<string> {
    const redis = await this.getRedis();
    const eventId = event.eventId || cryptoRandomId();
    const version = event.version || "v1";
    const timestamp = new Date().toISOString();

    const messageId = await redis.xadd(
      event.stream,
      "*",
      "event_id",
      eventId,
      "event_type",
      event.eventType,
      "version",
      version,
      "timestamp",
      timestamp,
      "org_id",
      event.orgId,
      "workspace_id",
      String(event.workspaceId || ""),
      "environment_id",
      String(event.environmentId || ""),
      "trace_id",
      String(event.traceId || ""),
      "stream",
      event.stream,
      "idempotency_key",
      event.idempotencyKey || eventId,
      "payload",
      JSON.stringify(event.payload),
      "retry_count",
      "0",
    );
    return String(messageId);
  }

  private async getRedis(): Promise<Redis> {
    if (!this.redisPromise) {
      this.redisPromise = connectRedis();
    }
    return this.redisPromise;
  }
}

function cryptoRandomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
}

export const governanceEventBus = new GovernanceEventBus();
