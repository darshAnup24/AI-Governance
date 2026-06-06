import { prisma } from "../../platform/prisma";
import { connectRedis } from "../../engine/redisEnrichment";

export type ReportWorkflowRequest = {
  orgId: string;
  userId: string;
  traceId?: string;
  format: "pdf" | "json" | "csv";
  type: "compliance" | "audit" | "incident" | "usage";
  framework?: string;
  modelIds?: string[];
  dateRange?: { start: Date; end: Date };
};

type WorkflowJobStatus = {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  updatedAt: string;
  type: string;
  error?: string;
  artifactUrl?: string;
  resultPreview?: string;
};

const WORKFLOW_STREAM = "workflow_jobs";
const WORKFLOW_RETRY_STREAM = "workflow_jobs_retry";
const WORKFLOW_DLQ_STREAM = "workflow_jobs_dlq";
const JOB_STATUS_PREFIX = "workflow_job_status:";

export class ReportWorkflowService {
  async enqueueReport(request: ReportWorkflowRequest) {
    const redis = await connectRedis();
    const jobId = `job_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    const now = new Date().toISOString();
    const status: WorkflowJobStatus = {
      jobId,
      status: "queued",
      updatedAt: now,
      type: "report_generation",
    };

    await redis.hset(`${JOB_STATUS_PREFIX}${jobId}`, status as Record<string, string>);
    await redis.expire(`${JOB_STATUS_PREFIX}${jobId}`, 60 * 60 * 24 * 7);
    await redis.xadd(
      WORKFLOW_STREAM,
      "*",
      "job_id",
      jobId,
      "job_type",
      "report_generation",
      "version",
      "v1",
      "timestamp",
      now,
      "org_id",
      request.orgId,
      "user_id",
      request.userId,
      "trace_id",
      request.traceId || "",
      "payload",
      JSON.stringify({
        format: request.format,
        type: request.type,
        framework: request.framework,
        modelIds: request.modelIds || [],
        dateRange: request.dateRange
          ? {
              start: request.dateRange.start.toISOString(),
              end: request.dateRange.end.toISOString(),
            }
          : null,
      }),
      "retry_count",
      "0",
    );

    return status;
  }

  async getJobStatus(jobId: string) {
    const redis = await connectRedis();
    const status = await redis.hgetall(`${JOB_STATUS_PREFIX}${jobId}`);
    if (Object.keys(status).length > 0) {
      return status;
    }
    const report = await prisma.reportHistory.findFirst({
      where: { fileUrl: { contains: jobId } },
      orderBy: { generatedAt: "desc" },
    });
    return report
      ? {
          jobId,
          status: "completed",
          updatedAt: report.generatedAt.toISOString(),
          type: "report_generation",
          artifactUrl: report.fileUrl,
        }
      : null;
  }

  get streams() {
    return {
      primary: WORKFLOW_STREAM,
      retry: WORKFLOW_RETRY_STREAM,
      dlq: WORKFLOW_DLQ_STREAM,
      statusPrefix: JOB_STATUS_PREFIX,
    };
  }
}
