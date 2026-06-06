import { governanceEventBus } from "../../platform/eventBus";
import { prisma } from "../../platform/prisma";

export class ProviderService {
  async listForOrg(orgId: string) {
    const providers = await prisma.provider.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });

    return providers.map((provider) => ({
      ...provider,
      apiKeyEncrypted: provider.apiKeyEncrypted
        ? `${provider.apiKeyEncrypted.slice(0, 3)}***`
        : "",
    }));
  }

  async create(input: {
    orgId: string;
    workspaceId?: string | null;
    name: string;
    type: string;
    apiKey?: string;
    apiUrl?: string | null;
    models?: unknown[];
    settings?: Record<string, unknown>;
    traceId?: string;
  }) {
    const provider = await prisma.provider.create({
      data: {
        orgId: input.orgId,
        workspaceId: input.workspaceId || null,
        name: input.name,
        type: input.type as any,
        apiKeyEncrypted: input.apiKey || "",
        apiUrl: input.apiUrl || null,
        models: (input.models as any) || [],
        settings: (input.settings as any) || {},
      },
    });

    await governanceEventBus.publish({
      stream: "telemetry_events",
      eventType: "ProviderConfigured",
      orgId: input.orgId,
      workspaceId: input.workspaceId,
      traceId: input.traceId,
      payload: {
        providerId: provider.id,
        providerType: provider.type,
        healthStatus: provider.healthStatus,
      },
    });

    return { ...provider, apiKeyEncrypted: "***" };
  }

  async delete(id: string, orgId: string, traceId?: string) {
    const provider = await prisma.provider.findFirst({ where: { id, orgId } });
    await prisma.provider.deleteMany({ where: { id, orgId } });

    if (provider) {
      await governanceEventBus.publish({
        stream: "telemetry_events",
        eventType: "ProviderDisconnected",
        orgId,
        workspaceId: provider.workspaceId,
        traceId,
        payload: {
          providerId: provider.id,
          providerType: provider.type,
        },
      });
    }

    return { deleted: true };
  }
}
