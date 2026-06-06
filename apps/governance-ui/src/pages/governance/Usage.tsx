import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, EmptyState, SectionLabel, KpiCard, KpiGrid, Button, fadeInUp, stagger } from '@airlock/shared-ui'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { governanceApi } from '@airlock/shared-ui'
import { DollarSign, Activity, Boxes, BarChart3 } from 'lucide-react'

export default function Usage() {
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspace()

  const { data: usage, isLoading } = useQuery({
    queryKey: ['usage', currentWorkspace?.id],
    queryFn: () => governanceApi.get('/usage', { params: { workspaceId: currentWorkspace?.id } }).then(r => r.data),
    enabled: !!currentWorkspace?.id && !!user?.organization?.id,
  })

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Billing</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          Usage & Billing
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">AI model usage tracking and billing overview</p>
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm animate-pulse">
              <div className="space-y-3">
                <div className="h-3 w-20 bg-[var(--muted)] rounded" />
                <div className="h-7 w-16 bg-[var(--muted)] rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : !usage ? (
        <Card>
          <EmptyState
            icon={<BarChart3 className="w-8 h-8" />}
            title="No usage data yet"
            description="Usage and billing analytics will appear here once your AI models are actively being used."
          />
        </Card>
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Total Requests" value={usage?.totalRequests || 0} icon={<Activity className="w-5 h-5" />} />
            <KpiCard label="Active Models" value={usage?.activeModels || 0} icon={<Boxes className="w-5 h-5" />} />
            <KpiCard label="Monthly Cost" value={usage?.monthlyCost ? `$${usage.monthlyCost}` : '$0'} icon={<DollarSign className="w-5 h-5" />} />
            <KpiCard label="Avg Cost/Request" value={usage?.avgCostPerRequest ? `$${usage.avgCostPerRequest}` : '$0'} icon={<DollarSign className="w-5 h-5" />} />
          </KpiGrid>
        </>
      )}
    </motion.div>
  )
}
