import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, EmptyState, SectionLabel, KpiCard, KpiGrid, fadeInUp, stagger, StatusPill } from '@airlock/shared-ui'
import { governanceApi } from '@airlock/shared-ui'
import { Wifi, Activity, AlertTriangle, Shield } from 'lucide-react'

export default function ShadowAI() {
  const { data: stats } = useQuery({
    queryKey: ['shadow-ai-stats'],
    queryFn: () => governanceApi.get('/shadow-ai/stats').then(r => r.data),
  })

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Detection</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          Shadow AI
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Detect unsanctioned AI service usage across your organization</p>
      </motion.div>

      {stats ? (
        <KpiGrid columns={4}>
          <KpiCard label="Detected Services" value={stats.detectedServices || 0} icon={<Wifi className="w-5 h-5" />} />
          <KpiCard label="Active Users" value={stats.activeUsers || 0} icon={<Activity className="w-5 h-5" />} />
          <KpiCard label="High Risk" value={stats.highRisk || 0} icon={<AlertTriangle className="w-5 h-5" />} variant="danger" />
          <KpiCard label="Blocked" value={stats.blocked || 0} icon={<Shield className="w-5 h-5" />} />
        </KpiGrid>
      ) : (
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
      )}

      <motion.div variants={fadeInUp}>
        <Card>
          <EmptyState
            icon={<Wifi className="w-8 h-8" />}
            title="Shadow AI Monitoring Active"
            description="Shadow AI detection is monitoring network traffic for unsanctioned AI service usage. Detected services and usage patterns will appear here."
          />
        </Card>
      </motion.div>
    </motion.div>
  )
}
