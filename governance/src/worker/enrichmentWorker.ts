import { connectRedis } from "../engine/redisEnrichment";
import { prisma } from "../platform/prisma";

const consumerGroup = process.env.ENRICHMENT_CONSUMER_GROUP || "governance-enrichment-workers";
const consumerName =
  process.env.ENRICHMENT_CONSUMER_NAME || `enrichment-${Math.random().toString(16).slice(2, 8)}`;
const streamName = "telemetry_events";

async function run() {
  const redis = await connectRedis();
  try {
    await redis.xgroup("CREATE", streamName, consumerGroup, "0", "MKSTREAM");
  } catch {
    // group exists
  }

  while (true) {
    const messages = (await redis.xreadgroup(
      "GROUP",
      consumerGroup,
      consumerName,
      "COUNT",
      "10",
      "BLOCK",
      "3000",
      "STREAMS",
      streamName,
      ">",
    )) as any[] | null;

    if (!messages || messages.length === 0) {
      continue;
    }

    for (const [, entries] of messages) {
      for (const [messageId, fields] of entries) {
        const data = pairArrayToObject(fields);
        if (String(data.event_type) === "GovernanceEnrichmentRequested") {
          const payload = JSON.parse(String(data.payload || "{}"));
          await prisma.auditLog.create({
            data: {
              orgId: String(data.org_id || ""),
              action: "REPORT_GENERATED",
              resource: "enrichment_job",
              details: {
                enrichmentType: payload.type || "unknown",
                jobPayload: payload,
                streamMessageId: messageId,
              },
            },
          });
        }
        await redis.xack(streamName, consumerGroup, messageId);
      }
    }
  }
}

function pairArrayToObject(values: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    result[values[index]] = values[index + 1];
  }
  return result;
}

void run();
