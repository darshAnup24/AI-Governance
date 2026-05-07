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
      api.get('/api/v1/audit-events', { params }).then(r => r.data),
    retry: 2,
    staleTime: 30_000,
  })
}

export function useAnalyticsTrend(days = 30) {
  return useQuery({
    queryKey: ['analyticsTrend', days],
    queryFn: () =>
      api.get('/api/v1/analytics/trend', { params: { days } }).then(r => r.data.data),
    retry: 2,
    staleTime: 60_000,
  })
}

export function useDetectionBreakdown() {
  return useQuery({
    queryKey: ['detectionBreakdown'],
    queryFn: () =>
      api.get('/api/v1/analytics/categories').then(r => r.data),
    retry: 2,
    staleTime: 60_000,
  })
}

export function useShadowAIAlerts() {
  return useQuery({
    queryKey: ['shadowAIAlerts'],
    queryFn: () =>
      api.get('/api/v1/shadow-ai/detections').then(r => r.data),
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () =>
      govApi.get('/api/dashboard/stats').then(r => r.data),
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// ── Governance (port 4000) ─────────────────────────────────────────────────

export function usePolicies() {
  return useQuery({
    queryKey: ['policies'],
    queryFn: () =>
      govApi.get('/api/policies').then(r => r.data),
    retry: 2,
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () =>
      govApi.get('/api/users').then(r => r.data),
    retry: 2,
  })
}

export function useUserHeatmap() {
  return useQuery({
    queryKey: ['userHeatmap'],
    queryFn: () =>
      govApi.get('/api/audit-logs/by-user').then(r => r.data),
    retry: 2,
    staleTime: 120_000,
  })
}

export function useComplianceChecks() {
  return useQuery({
    queryKey: ['complianceChecks'],
    queryFn: () =>
      govApi.get('/api/compliance/checks/org').then(r => r.data),
    retry: 2,
  })
}

export function useComplianceFrameworks() {
  return useQuery({
    queryKey: ['complianceFrameworks'],
    queryFn: () =>
      govApi.get('/api/compliance/frameworks').then(r => r.data),
    retry: 2,
    staleTime: 300_000,
  })
}

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => govApi.get('/api/vendors').then(r => r.data),
    retry: 2,
  })
}

export function useIncidents() {
  return useQuery({
    queryKey: ['incidents'],
    queryFn: () => govApi.get('/api/incidents').then(r => r.data),
    retry: 2,
  })
}

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => govApi.get('/api/models').then(r => r.data),
    retry: 2,
  })
}

export function useThreats(params?: { status?: string; severity?: string; days?: number }) {
  return useQuery({
    queryKey: ['threats', params],
    queryFn: () => govApi.get('/api/threats', { params }).then(r => r.data),
    retry: 2,
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

// ── Report Mutations ──────────────────────────────────────────────────────

export function useGenerateReport() {
  return useMutation({
    mutationFn: (payload: { format: string; framework?: string; dateRange?: string }) =>
      govApi.post('/api/reports/generate', payload, { responseType: 'blob' }).then(r => r.data),
  })
}
