import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, Badge, EmptyState, Button, SectionLabel } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { governanceApi } from '@airlock/shared-ui'
import { CheckCircle2, RefreshCw } from 'lucide-react'

export default function Compliance() {
  const { currentWorkspace } = useWorkspace()

  const { data, isLoading } = useQuery({
    queryKey: ['compliance', currentWorkspace?.id],
    queryFn: () => governanceApi.get('/compliance', { params: { workspaceId: currentWorkspace?.id } }).then(r => r.data),
    enabled: !!currentWorkspace?.id,
  })

  const profiles = data?.profiles || []

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <SectionLabel>Regulations</SectionLabel>
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
            Compliance
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">AI governance framework adherence tracking</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />}>Run Scan</Button>
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-xl" />)}
          </div>
        </div>
      ) : profiles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8" />}
            title="No compliance frameworks configured"
            description="Set up compliance profiles for EU AI Act, ISO 27001, SOC 2, or custom frameworks to track adherence."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                  {['Framework', 'Status', 'Score', 'Target'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.12em] font-mono px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p: any) => (
                  <tr key={p.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--foreground)]">{p.framework}</td>
                    <td className="px-6 py-4">
                      <Badge variant={p.status === 'COMPLIANT' ? 'success' : p.status === 'PARTIALLY_COMPLIANT' ? 'warning' : 'danger'}>
                        {p.status?.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)]" style={{ width: `${p.score || 0}%` }} />
                        </div>
                        <span className="text-sm font-medium text-[var(--foreground)]">{p.score != null ? `${p.score}%` : '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{p.targetScore != null ? `${p.targetScore}%` : '—'}</td>
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
