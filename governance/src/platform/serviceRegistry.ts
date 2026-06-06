import { DashboardAnalyticsService } from "../domains/analytics/dashboardAnalyticsService";
import { IncidentService } from "../domains/incidents/incidentService";
import { PolicyService } from "../domains/policies/policyService";
import { ProviderService } from "../domains/providers/providerService";
import { ReportWorkflowService } from "../domains/workflows/reportWorkflowService";

export type ServiceDescriptor = {
  name: string;
  ownership: string;
  mode: "gateway-embedded" | "worker" | "analytics";
  responsibilities: string[];
};

class GovernanceServiceRegistry {
  readonly analytics = new DashboardAnalyticsService();
  readonly incidents = new IncidentService();
  readonly policies = new PolicyService();
  readonly providers = new ProviderService();
  readonly reports = new ReportWorkflowService();

  describe(): ServiceDescriptor[] {
    return [
      {
        name: "identity-service",
        ownership: "governance-auth",
        mode: "gateway-embedded",
        responsibilities: ["sessions", "rbac", "organization auth"],
      },
      {
        name: "policy-service",
        ownership: "governance-policies",
        mode: "gateway-embedded",
        responsibilities: ["policy CRUD", "policy distribution", "policy events"],
      },
      {
        name: "incident-service",
        ownership: "governance-incidents",
        mode: "gateway-embedded",
        responsibilities: ["incident lifecycle", "incident events", "triage state"],
      },
      {
        name: "provider-service",
        ownership: "governance-providers",
        mode: "gateway-embedded",
        responsibilities: ["provider inventory", "provider credentials", "provider change events"],
      },
      {
        name: "analytics-service",
        ownership: "governance-analytics",
        mode: "analytics",
        responsibilities: ["dashboard aggregates", "clickhouse materialization", "telemetry rollups"],
      },
      {
        name: "worker-service",
        ownership: "governance-workflows",
        mode: "worker",
        responsibilities: ["report generation", "enrichment", "async heavy workflows"],
      },
    ];
  }
}

export const serviceRegistry = new GovernanceServiceRegistry();
