import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379/0";
let redis: Redis | null = null;

export async function connectRedis() {
  if (!redis) {
    redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }
  if (redis.status !== "ready") {
    await redis.connect();
  }
  return redis;
}

export async function publishEnrichmentJob(
  type: string,
  payload: Record<string, unknown>,
  orgId: string,
) {
  const client = await connectRedis();
  const jobId = cryptoRandomId();
  await client.xadd(
    "telemetry_events",
    "*",
    "event_id",
    jobId,
    "event_type",
    "GovernanceEnrichmentRequested",
    "version",
    "v1",
    "timestamp",
    new Date().toISOString(),
    "org_id",
    orgId,
    "workspace_id",
    String(payload.workspaceId || ""),
    "trace_id",
    String(payload.traceId || ""),
    "stream",
    "telemetry_events",
    "payload",
    JSON.stringify({ type, ...payload }),
    "retry_count",
    "0",
  );
  return jobId;
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
