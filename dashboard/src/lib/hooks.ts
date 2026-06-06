// ─────────────────────────────────────────────────────────────────────────────────
//  QUERY HOOKS  (TanStack Query v5)
//  All data-fetching is centralised here.
//  Each hook calls the real API first.
//  On error, the UI shows error states with retry.
// ─────────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import govApi from './govApi'

// Re-export utilities for inline mutations in components
export { useQuery, useMutation, useQueryClient }

// ── Proxy / Audit (port 8000) ─────────────────────────────────────────────────────

export function useAuditEvents(params?: { action?: string; limit?: number }) {
  return useQuery({
    queryKey: ['auditEvents', params],
    queryFn: () =>
      api.get('/api/v1/audit-events', { params }).then(r => r.data.data ?? []),
    retry: 2,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

export function useAnalyticsTrend(days = 30) {
  return useQuery({
    queryKey: ['analyticsTrend', days],
    queryFn: () =>
      api.get('/api/v1/analytics/trend', { params: { days } }).then(r => {
        // Proxy returns {blocked, redacted, warned, allowed} — remap to chart keys
        const rows: any[] = r.data.data ?? []
        return rows.map(d => ({
          date:    d.date,
          ALLOW:   d.allowed  ?? 0,
          WARN:    d.warned   ?? 0,
          REDACT:  d.redacted ?? 0,
          BLOCK:   d.blocked  ?? 0,
          LOG:     d.logged   ?? 0,
        }))
      }),
    retry: 2,
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

export function useDetectionBreakdown() {
  return useQuery({
    queryKey: ['detectionBreakdown'],
    queryFn: () =>
      api.get('/api/v1/analytics/categories').then(r => {
        // endpoint returns a plain array; guard in case it ever returns a wrapper
        const d = r.data
        return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })
}

export function useShadowAIAlerts() {
  return useQuery({
    queryKey: ['shadowAIAlerts'],
    queryFn: () =>
      api.get('/api/v1/shadow-ai/detections').then(r => r.data.data ?? []),
    retry: 2,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })
}

// Governance-level stats (models, incidents, policies, compliance) from port 4000
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () =>
      govApi.get('/api/dashboard/stats').then(r => r.data),
    retry: 2,
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

// Proxy-level stats (prompt counts, block/redact rates, avg risk) from port 8000
export function useProxyStats() {
  return useQuery({
    queryKey: ['proxyStats'],
    queryFn: () =>
      api.get('/api/v1/stats').then(r => r.data),
    retry: 2,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

// ── Governance (port 4000) ─────────────────────────────────────────────────

export function usePolicies() {
  return useQuery({
    queryKey: ['policies'],
    queryFn: () =>
      govApi.get('/api/policies').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () =>
      govApi.get('/api/users').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
  })
}

export function useUserHeatmap() {
  return useQuery({
    queryKey: ['userHeatmap'],
    queryFn: () =>
      govApi.get('/api/audit-logs/by-user').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 120_000,
  })
}

export function useComplianceChecks() {
  return useQuery({
    queryKey: ['complianceChecks'],
    queryFn: () =>
      govApi.get('/api/compliance/checks/org').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

export function useComplianceFrameworks() {
  return useQuery({
    queryKey: ['complianceFrameworks'],
    queryFn: () =>
      govApi.get('/api/compliance/frameworks').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 300_000,
  })
}

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => govApi.get('/api/vendors').then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
    }),
    retry: 2,
  })
}

export function useIncidents() {
  return useQuery({
    queryKey: ['incidents'],
    queryFn: () => govApi.get('/api/incidents').then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
    }),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => govApi.get('/api/models').then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
    }),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

export function useThreats(params?: { status?: string; severity?: string; days?: number }) {
  return useQuery({
    queryKey: ['threats', params],
    queryFn: () => govApi.get('/api/threats', { params }).then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
    }),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })
}

// ── Policy Mutations ──────────────────────────────────────────────────────

export function useCreatePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => govApi.post('/api/policies', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  })
}

export function useUpdatePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: any) => govApi.put(`/api/policies/${id}`, payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  })
}

export function useDeletePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => govApi.delete(`/api/policies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  })
}

export function useTogglePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      govApi.put(`/api/policies/${id}`, { enabled }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  })
}

// ── Analytics Hooks ──────────────────────────────────────────────────────

export function useLatencyPercentiles() {
  return useQuery({
    queryKey: ['latencyPercentiles'],
    queryFn: () =>
      api.get('/api/v1/analytics/latency').then(r => r.data),
    retry: 2,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
}

export function useRedisHealth() {
  return useQuery({
    queryKey: ['redisHealth'],
    queryFn: () =>
      api.get('/api/v1/analytics/redis-health').then(r => r.data),
    retry: 2,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
}

export function useUpstreamLatency() {
  return useQuery({
    queryKey: ['upstreamLatency'],
    queryFn: () =>
      api.get('/api/v1/analytics/upstream-latency').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
}

export function useQueueDepth() {
  return useQuery({
    queryKey: ['queueDepth'],
    queryFn: () =>
      api.get('/api/v1/analytics/queue-depth').then(r => r.data),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
  })
}

export function useActiveStreams() {
  return useQuery({
    queryKey: ['activeStreams'],
    queryFn: () =>
      api.get('/api/v1/analytics/streams').then(r => r.data),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
  })
}

export function useRuntimeMode() {
  return useQuery({
    queryKey: ['runtimeMode'],
    queryFn: () => api.get('/api/v1/runtime-mode').then(r => r.data),
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 5_000,
  })
}

// ── Report Mutations ──────────────────────────────────────────────────────

export function useGenerateReport() {
  return useMutation({
    mutationFn: (payload: { format: string; framework?: string; dateRange?: string }) =>
      govApi.post('/api/reports/generate', payload, { responseType: 'blob' }).then(r => r.data),
  });
}

// ── Vendor SLA Hooks ──────────────────────────────────────────────────────

export function useVendorSLAs(vendorId: string) {
  return useQuery({
    queryKey: ['vendorSLAs', vendorId],
    queryFn: () =>
      govApi.get(`/api/vendors/${vendorId}/slas`).then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    enabled: !!vendorId,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useVendorSLASummary(vendorId: string) {
  return useQuery({
    queryKey: ['vendorSLASummary', vendorId],
    queryFn: () =>
      govApi.get(`/api/vendors/${vendorId}/slas/summary`).then(r => r.data),
    enabled: !!vendorId,
    retry: 2,
    staleTime: 30_000,
  });
}

// ── Incident Events Hooks ─────────────────────────────────────────────────

export function useIncidentEvents(incidentId: string) {
  return useQuery({
    queryKey: ['incidentEvents', incidentId],
    queryFn: () =>
      govApi.get(`/api/incidents/${incidentId}/events`).then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    enabled: !!incidentId,
    retry: 2,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

// ── API Keys Hooks ────────────────────────────────────────────────────────

export function useAPIKeys() {
  return useQuery({
    queryKey: ['apiKeys'],
    queryFn: () =>
      govApi.get('/api/api-keys').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useCreateAPIKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => govApi.post('/api/api-keys', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}

export function useRevokeAPIKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => govApi.delete(`/api/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}

// ── Organization Hooks ────────────────────────────────────────────────────

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: () =>
      govApi.get('/api/organization').then(r => r.data),
    retry: 2,
    staleTime: 60_000,
  });
}

// ── Routing Rules Hooks ───────────────────────────────────────────────────

export function useRoutingRules() {
  return useQuery({
    queryKey: ['routingRules'],
    queryFn: () =>
      govApi.get('/api/routing-rules').then(r => {
        const d = r.data; return Array.isArray(d) ? d : (d?.data ?? [])
      }),
    retry: 2,
    staleTime: 30_000,
  });
}

// ── Advisor RAG Hooks ─────────────────────────────────────────────────────

export function useAdvisorContext() {
  return useQuery({
    queryKey: ['advisorContext'],
    queryFn: () =>
      govApi.post('/api/advisor/context', {}).then(r => r.data),
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
