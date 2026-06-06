import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, Badge, EmptyState, Button, SectionLabel } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useAuth } from '../../contexts/AuthContext'
import { governanceApi } from '@airlock/shared-ui'
import { Boxes, Plus } from 'lucide-react'

const riskVariant = (val: string) => {
  if (val === 'HIGH') return 'danger' as const
  if (val === 'LIMITED') return 'warning' as const
  return 'success' as const
}

export default function Models() {
  const { currentWorkspace } = useWorkspace()
  const { hasRole } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['models', currentWorkspace?.id],
    queryFn: () => governanceApi.get('/models', { params: { workspaceId: currentWorkspace?.id } }).then(r => r.data),
    enabled: !!currentWorkspace?.id,
  })

  const models = data?.models || []

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <SectionLabel>Inventory</SectionLabel>
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
            AI Models
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">Track and manage AI models across your organization</p>
        </div>
        {hasRole(['OWNER', 'ADMIN', 'AI_ENGINEER']) && (
          <Button icon={<Plus className="w-4 h-4" />}>Register Model</Button>
        )}
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-[var(--muted)] rounded-xl" />
            ))}
          </div>
        </div>
      ) : models.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="w-8 h-8" />}
            title="No AI models registered"
            description="Register your first AI model to start monitoring governance, risk, and compliance across your ML estate."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                  {['Name', 'Provider', 'Version', 'Purpose', 'Risk', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.12em] font-mono px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((m: any) => (
                  <tr key={m.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--foreground)]">{m.name}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{m.provider}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{m.version}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{m.purpose}</td>
                    <td className="px-6 py-4"><Badge variant={riskVariant(m.riskLevel)}>{m.riskLevel}</Badge></td>
                    <td className="px-6 py-4"><Badge variant="default">{m.status}</Badge></td>
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
