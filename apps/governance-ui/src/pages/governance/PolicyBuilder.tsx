import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, Badge, EmptyState, Button, SectionLabel } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { governanceApi } from '@airlock/shared-ui'
import { Shield, Plus } from 'lucide-react'

const actionVariant = (val: string) => {
  if (val === 'BLOCK') return 'danger' as const
  if (val === 'ALERT') return 'warning' as const
  return 'success' as const
}

export default function PolicyBuilder() {
  const { currentWorkspace } = useWorkspace()

  const { data, isLoading } = useQuery({
    queryKey: ['policies', currentWorkspace?.id],
    queryFn: () => governanceApi.get('/policies', { params: { workspaceId: currentWorkspace?.id } }).then(r => r.data),
    enabled: !!currentWorkspace?.id,
  })

  const policies = data?.policies || []

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <SectionLabel>Rules</SectionLabel>
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
            Policy Builder
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">Create and manage AI governance rules</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />}>New Policy</Button>
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-xl" />)}
          </div>
        </div>
      ) : policies.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Shield className="w-8 h-8" />}
            title="No policies configured"
            description="Create policies to control AI model behavior — block sensitive data, alert on bias, enforce content safety rules."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Name', 'Description', 'Category', 'Action', 'Priority', 'Enabled'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policies.map((p: any) => (
                  <tr key={p.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--foreground)]">{p.name}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{p.description}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{p.category}</td>
                    <td className="px-6 py-4"><Badge variant={actionVariant(p.action)}>{p.action}</Badge></td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{p.priority}</td>
                    <td className="px-6 py-4"><Badge variant={p.enabled ? 'success' : 'default'}>{p.enabled ? 'Yes' : 'No'}</Badge></td>
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
