import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, Badge, EmptyState, Button, SectionLabel, StatusPill } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { useAuth } from '../../contexts/AuthContext'
import { governanceApi } from '@airlock/shared-ui'
import { Users, Plus } from 'lucide-react'

export default function Vendors() {
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['providers', user?.organization?.id],
    queryFn: () => governanceApi.get('/providers').then(r => r.data),
    enabled: !!user?.organization?.id,
  })

  const providers = data?.providers || []

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <SectionLabel>Providers</SectionLabel>
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
            Vendors
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">AI service provider management</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />}>Add Provider</Button>
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-xl" />)}
          </div>
        </div>
      ) : providers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title="No providers connected"
            description="Connect AI providers like OpenAI and Anthropic to enable governance monitoring, usage tracking, and policy enforcement."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Name', 'Type', 'Models', 'Health'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider px-6 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providers.map((p: any) => (
                  <tr key={p.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--foreground)]">{p.name}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{p.type}</td>
                    <td className="px-6 py-4 text-[var(--muted-foreground)]">{p.models?.join(', ') || '—'}</td>
                    <td className="px-6 py-4"><StatusPill status={p.healthStatus || 'unknown'} /></td>
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
