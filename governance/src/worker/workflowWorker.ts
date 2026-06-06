import { connectRedis } from "../engine/redisEnrichment";
import { generateComplianceReport, ReportConfig } from "../engine/reportGenerator";
import { ReportWorkflowService } from "../domains/workflows/reportWorkflowService";
import { prisma } from "../platform/prisma";

const workerConfig = {
  consumerGroup: process.env.WORKFLOW_CONSUMER_GROUP || "workflow-workers",
  consumerName:
    process.env.WORKFLOW_CONSUMER_NAME ||
    `workflow-${Math.random().toString(16).slice(2, 8)}`,
  batchSize: Number(process.env.WORKFLOW_BATCH_SIZE || "10"),
  blockMs: Number(process.env.WORKFLOW_BLOCK_MS || "3000"),
  maxRetries: Number(process.env.WORKFLOW_MAX_RETRIES || "3"),
};

const workflowService = new ReportWorkflowService();

async function processReportJob(jobId: string, orgId: string, userId: string, payload: any) {
  const config: ReportConfig = {
    format: payload.format,
    type: payload.type,
    framework: payload.framework,
    modelIds: payload.modelIds || [],
    dateRange: payload.dateRange
      ? {
          start: new Date(payload.dateRange.start),
          end: new Date(payload.dateRange.end),
        }
      : undefined,
  };

  const result = await generateComplianceReport(orgId, config);
  const extension = config.format === "pdf" ? "pdf" : config.format === "csv" ? "csv" : "json";
  const artifactUrl = `generated/workflows/${jobId}.${extension}`;
  const preview =
    result.data
      ? JSON.stringify(result.data).slice(0, 2000)
      : result.csv
        ? result.csv.slice(0, 2000)
        : result.buffer
          ? result.buffer.toString("utf8", 0, Math.min(result.buffer.length, 1000))
          : "";

  await prisma.reportHistory.create({
    data: {
      orgId,
      reportType: config.type,
      format: config.format.toUpperCase() as any,
      fileUrl: artifactUrl,
      parameters: {
        ...config,
        workflowJobId: jobId,
        preview,
      } as any,
      generatedBy: userId,
    },
  });

  return { artifactUrl, preview };
}

async function run() {
  const redis = await connectRedis();
  const { primary, retry, dlq, statusPrefix } = workflowService.streams;

  for (const stream of [primary, retry]) {
    try {
      await redis.xgroup("CREATE", stream, workerConfig.consumerGroup, "0", "MKSTREAM");
    } catch {
      // group exists
    }
  }

  while (true) {
    const messages = (await redis.xreadgroup(
      "GROUP",
      workerConfig.consumerGroup,
      workerConfig.consumerName,
      "COUNT",
      String(workerConfig.batchSize),
      "BLOCK",
      String(workerConfig.blockMs),
      "STREAMS",
      primary,
      retry,
      ">",
      ">",
    )) as any[] | null;

    if (!messages || messages.length === 0) {
      continue;
    }

    for (const [streamName, streamMessages] of messages) {
      for (const [messageId, fields] of streamMessages) {
        const data = pairArrayToObject(fields);
        const jobId = String(data.job_id || "");
        const retryCount = Number(data.retry_count || "0");
        const statusKey = `${statusPrefix}${jobId}`;

        try {
          await redis.hset(statusKey, {
            jobId,
            status: "processing",
            updatedAt: new Date().toISOString(),
            type: String(data.job_type || "workflow"),
          });

          const payload = JSON.parse(String(data.payload || "{}"));
          if (String(data.job_type) === "report_generation") {
            const outcome = await processReportJob(
              jobId,
              String(data.org_id || ""),
              String(data.user_id || ""),
              payload,
            );

            await redis.hset(statusKey, {
              jobId,
              status: "completed",
              updatedAt: new Date().toISOString(),
              type: "report_generation",
              artifactUrl: outcome.artifactUrl,
              resultPreview: outcome.preview,
            });
          } else {
            await redis.hset(statusKey, {
              jobId,
              status: "completed",
              updatedAt: new Date().toISOString(),
              type: String(data.job_type || "workflow"),
              resultPreview: JSON.stringify({ passthrough: true }),
            });
          }

          await redis.xack(streamName, workerConfig.consumerGroup, messageId);
        } catch (error: any) {
          if (retryCount + 1 < workerConfig.maxRetries) {
            await redis.xadd(
              retry,
              "*",
              ...objectToPairArray({
                ...data,
                retry_count: String(retryCount + 1),
                retried_at: new Date().toISOString(),
              }),
            );
          } else {
            await redis.xadd(
              dlq,
              "*",
              ...objectToPairArray({
                ...data,
                retry_count: String(retryCount + 1),
                failed_at: new Date().toISOString(),
                error: error?.message || "workflow failure",
              }),
            );
            await redis.hset(statusKey, {
              jobId,
              status: "failed",
              updatedAt: new Date().toISOString(),
              type: String(data.job_type || "workflow"),
              error: error?.message || "workflow failure",
            });
          }

          await redis.xack(streamName, workerConfig.consumerGroup, messageId);
        }
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

function objectToPairArray(value: Record<string, string>) {
  return Object.entries(value).flatMap(([key, entryValue]) => [key, String(entryValue)]);
}

void run();
