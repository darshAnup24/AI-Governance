// ─────────────────────────────────────────────
//  QUERY HOOKS  (TanStack Query v5)
//  All data-fetching is centralised here.
//  Each hook tries the real API first, falls
//  back to mock data on error so the UI always
//  renders while backends are being built.
// ─────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import govApi from './govApi'
import {
  mockAuditEvents,
  mockAnalyticsTrend,
  mockDetectionBreakdown,
  mockPolicies,
  mockUsers,
  mockUserHeatmap,
  mockShadowAIAlerts,
  mockDashboardStats,
} from './mockData'

// ── Proxy / Audit (port 8000) ──────────────────────────────────────────────

export function useAuditEvents(params?: { action?: string; limit?: number }) {
  return useQuery({
    queryKey: ['auditEvents', params],
    queryFn: () =>
      api.get('/api/v1/audit-events', { params }).then(r => r.data),
    initialData: mockAuditEvents,
    retry: 1,
    staleTime: 30_000,
  })
}

export function useAnalyticsTrend(days = 30) {
  return useQuery({
    queryKey: ['analyticsTrend', days],
    queryFn: () =>
      api.get('/api/v1/analytics/trend', { params: { days } }).then(r => r.data),
    initialData: mockAnalyticsTrend,
    retry: 1,
    staleTime: 60_000,
  })
}

export function useDetectionBreakdown() {
  return useQuery({
    queryKey: ['detectionBreakdown'],
    queryFn: () =>
      api.get('/api/v1/analytics/categories').then(r => r.data),
    initialData: mockDetectionBreakdown,
    retry: 1,
    staleTime: 60_000,
  })
}

export function useShadowAIAlerts() {
  return useQuery({
    queryKey: ['shadowAIAlerts'],
    queryFn: () =>
      api.get('/api/v1/shadow-ai/detections').then(r => r.data),
    initialData: mockShadowAIAlerts,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () =>
      govApi.get('/api/dashboard/stats').then(r => r.data),
    initialData: mockDashboardStats,
    retry: 1,
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
    initialData: mockPolicies,
    retry: 1,
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () =>
      govApi.get('/api/users').then(r => r.data),
    initialData: mockUsers,
    retry: 1,
  })
}

export function useUserHeatmap() {
  return useQuery({
    queryKey: ['userHeatmap'],
    queryFn: () =>
      govApi.get('/api/audit/by-user').then(r => r.data),
    initialData: mockUserHeatmap,
    retry: 1,
    staleTime: 120_000,
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
