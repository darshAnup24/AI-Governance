import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, Badge, EmptyState, SectionLabel, StatusPill } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { governanceApi } from '@airlock/shared-ui'
import { AlertTriangle } from 'lucide-react'

export default function Incidents() {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', currentWorkspace?.id],
    queryFn: () => governanceApi.get('/incidents', { params: { workspaceId: currentWorkspace?.id } }).then(r => r.data),
    enabled: !!currentWorkspace?.id,
  })

  const incidents = data?.incidents || []

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Security</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          Incidents
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">AI security and compliance incident management</p>
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-xl" />)}
          </div>
        </div>
      ) : incidents.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8" />}
            title="No incidents reported"
            description="Your AI estate is secure. When incidents are detected by policy violations or bias scans, they will appear here."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                  {['Title', 'Severity', 'Status', 'Assigned To', 'Created', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.12em] font-mono px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc: any) => (
                  <tr
                    key={inc.id}
                    onClick={() => navigate(`/governance/incidents/${inc.id}`)}
                    className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--muted)]/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-medium text-[var(--foreground)]">{inc.title}</td>
                    <td className="px-6 py-4">
                      <Badge variant={inc.severity === 'CRITICAL' ? 'danger' : inc.severity === 'HIGH' ? 'warning' : 'info'}>
                        {inc.severity}
                      </Badge>
                    </td>
                    <td className="px-6 py-4"><StatusPill status={inc.status.toLowerCase()} /></td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{inc.assignee?.name || '—'}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{new Date(inc.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      {inc._count?.comments ? (
                        <span className="text-xs text-[var(--muted-foreground)]">{inc._count.comments} comments</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  )
}
