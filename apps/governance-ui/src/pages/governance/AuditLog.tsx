import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Card, Badge, Button, EmptyState, SectionLabel, fadeInUp, stagger,
} from '@airlock/shared-ui'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { governanceApi } from '@airlock/shared-ui'
import { FileText, Download, ChevronLeft, ChevronRight, Search, Calendar, X } from 'lucide-react'

const AUDIT_ACTIONS = [
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'MFA_ENABLED', 'MFA_DISABLED',
  'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_ROLE_CHANGED',
  'INVITATION_CREATED', 'INVITATION_ACCEPTED', 'INVITATION_REVOKED',
  'ORGANIZATION_CREATED', 'ORGANIZATION_UPDATED', 'ORGANIZATION_DELETED',
  'WORKSPACE_CREATED', 'WORKSPACE_UPDATED', 'WORKSPACE_DELETED',
  'ENVIRONMENT_CREATED', 'ENVIRONMENT_UPDATED', 'ENVIRONMENT_DELETED',
  'POLICY_CREATED', 'POLICY_UPDATED', 'POLICY_DELETED', 'POLICY_ENABLED', 'POLICY_DISABLED',
  'INCIDENT_CREATED', 'INCIDENT_UPDATED', 'INCIDENT_ASSIGNED', 'INCIDENT_ESCALATED', 'INCIDENT_RESOLVED',
  'MODEL_CREATED', 'MODEL_UPDATED', 'MODEL_DELETED', 'MODEL_DEPLOYED',
  'PROVIDER_CONNECTED', 'PROVIDER_DISCONNECTED', 'PROVIDER_UPDATED',
  'API_KEY_CREATED', 'API_KEY_REVOKED', 'API_KEY_USED',
  'REPORT_GENERATED', 'REPORT_DOWNLOADED',
  'SETTINGS_UPDATED', 'COMPLIANCE_SCAN_COMPLETED', 'AUDIT_LOG_EXPORTED',
  'SSO_CONFIGURED', 'SSO_DISABLED',
]

const ACTION_GROUPS: Record<string, string[]> = {
  Auth: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'MFA_ENABLED', 'MFA_DISABLED'],
  Users: ['USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_ROLE_CHANGED', 'INVITATION_CREATED', 'INVITATION_ACCEPTED', 'INVITATION_REVOKED'],
  Organization: ['ORGANIZATION_CREATED', 'ORGANIZATION_UPDATED', 'ORGANIZATION_DELETED', 'WORKSPACE_CREATED', 'WORKSPACE_UPDATED', 'WORKSPACE_DELETED', 'ENVIRONMENT_CREATED', 'ENVIRONMENT_UPDATED', 'ENVIRONMENT_DELETED'],
  Policies: ['POLICY_CREATED', 'POLICY_UPDATED', 'POLICY_DELETED', 'POLICY_ENABLED', 'POLICY_DISABLED'],
  Incidents: ['INCIDENT_CREATED', 'INCIDENT_UPDATED', 'INCIDENT_ASSIGNED', 'INCIDENT_ESCALATED', 'INCIDENT_RESOLVED'],
  Models: ['MODEL_CREATED', 'MODEL_UPDATED', 'MODEL_DELETED', 'MODEL_DEPLOYED'],
  Providers: ['PROVIDER_CONNECTED', 'PROVIDER_DISCONNECTED', 'PROVIDER_UPDATED'],
  'API Keys': ['API_KEY_CREATED', 'API_KEY_REVOKED', 'API_KEY_USED'],
  Other: ['REPORT_GENERATED', 'REPORT_DOWNLOADED', 'SETTINGS_UPDATED', 'COMPLIANCE_SCAN_COMPLETED', 'AUDIT_LOG_EXPORTED', 'SSO_CONFIGURED', 'SSO_DISABLED'],
}

const PAGE_SIZE = 50

export default function AuditLog() {
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspace()
  const [actionFilter, setActionFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(0)
  const [selectedEntry, setSelectedEntry] = useState<any>(null)

  const params: any = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  if (actionFilter) params.action = actionFilter
  if (startDate) params.startDate = new Date(startDate).toISOString()
  if (endDate) params.endDate = new Date(endDate + 'T23:59:59').toISOString()
  if (searchQuery) params.resource = searchQuery
  if (currentWorkspace?.id) params.workspaceId = currentWorkspace.id

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', user?.organization?.id, actionFilter, startDate, endDate, searchQuery, page, currentWorkspace?.id],
    queryFn: () => governanceApi.get('/audit-logs', { params }).then(r => r.data),
    enabled: !!user?.organization?.id,
  })

  const { data: stats } = useQuery({
    queryKey: ['audit-logs-stats', currentWorkspace?.id],
    queryFn: () => governanceApi.get('/audit-logs/stats', { params: { workspaceId: currentWorkspace?.id } }).then(r => r.data),
    enabled: !!user?.organization?.id,
  })

  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const hasFilters = actionFilter || startDate || endDate || searchQuery

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <SectionLabel>Events</SectionLabel>
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
            Audit Log
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">Immutable record of all governance actions</p>
        </div>
        <Button variant="secondary" icon={<Download className="w-4 h-4" />}>Export CSV</Button>
      </motion.div>

      {stats && (
        <motion.div variants={fadeInUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <p className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">{stats.totalLogs || 0}</p>
            <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider font-mono mt-1">Total Events</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <p className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">{stats.actionCounts?.length || 0}</p>
            <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider font-mono mt-1">Action Types</p>
          </div>
          <div className="lg:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-wrap gap-1.5">
              {(stats.actionCounts || []).slice(0, 8).map((ac: any) => (
                <Badge key={ac.action} variant="default">{ac.action.replace(/_/g, ' ')} ({ac._count})</Badge>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <motion.div variants={fadeInUp} className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider font-mono mb-1.5">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
            className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] transition-all"
          >
            <option value="">All actions</option>
            {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
              <optgroup key={group} label={group}>
                {actions.map((a) => (
                  <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider font-mono mb-1.5">From</label>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(0) }}
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] transition-all"
            />
          </div>
        </div>

        <div className="w-40">
          <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider font-mono mb-1.5">To</label>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(0) }}
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] transition-all"
            />
          </div>
        </div>

        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider font-mono mb-1.5">Search</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              placeholder="Resource or user..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0) }}
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] transition-all"
            />
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={() => { setActionFilter(''); setStartDate(''); setEndDate(''); setSearchQuery(''); setPage(0) }}
            className="h-12 px-4 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-xl" />)}
          </div>
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title="No audit log entries"
            description={hasFilters ? 'No entries match your filters. Try adjusting them.' : 'Audit events will be recorded here as actions are taken across your organization.'}
            action={hasFilters ? <Button variant="secondary" onClick={() => { setActionFilter(''); setStartDate(''); setEndDate(''); setSearchQuery(''); setPage(0) }}>Clear Filters</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <Card padding="none">
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                    {['Action', 'Resource', 'User', '', 'Timestamp', 'IP'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.12em] font-mono px-6 py-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry: any) => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--muted)]/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <Badge variant="default">{entry.action.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-6 py-4 text-[var(--muted-foreground)]">{entry.resource || '—'}</td>
                      <td className="px-6 py-4 text-[var(--muted-foreground)]">{entry.user?.email || entry.user?.name || 'System'}</td>
                      <td className="px-6 py-4">
                        {entry.severity === 'CRITICAL' ? <span className="text-red-500 text-xs font-bold">!!</span> : null}
                      </td>
                      <td className="px-6 py-4 text-xs text-[var(--muted-foreground)]">{new Date(entry.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-[var(--muted-foreground)]/70">{entry.ipAddress || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--muted-foreground)]">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} entries
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(0, Math.min(page - 2, totalPages - 5))
                const p = start + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      p === page
                        ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {selectedEntry && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedEntry(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Audit Entry Details</h3>
                <button onClick={() => setSelectedEntry(null)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Action', value: <Badge>{selectedEntry.action?.replace(/_/g, ' ')}</Badge> },
                    { label: 'Severity', value: <Badge variant={selectedEntry.severity === 'CRITICAL' ? 'danger' : selectedEntry.severity === 'HIGH' ? 'warning' : 'default'}>{selectedEntry.severity || 'LOW'}</Badge> },
                    { label: 'Timestamp', value: new Date(selectedEntry.timestamp).toLocaleString() },
                    { label: 'IP Address', value: <span className="font-mono">{selectedEntry.ipAddress || '—'}</span> },
                    { label: 'User', value: selectedEntry.user?.name || selectedEntry.user?.email || 'System' },
                    { label: 'Resource', value: selectedEntry.resource || '—' },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-[var(--muted-foreground)] mb-1">{item.label}</p>
                      <p className="text-sm text-[var(--foreground)]">{item.value}</p>
                    </div>
                  ))}
                </div>
                {selectedEntry.details && Object.keys(selectedEntry.details).length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">Details</p>
                    <pre className="text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded-xl p-3 overflow-x-auto max-h-48">
                      {JSON.stringify(selectedEntry.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  )
}
