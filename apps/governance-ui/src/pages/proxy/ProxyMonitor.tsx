import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, EmptyState, SectionLabel, KpiCard, KpiGrid, fadeInUp, stagger, StatusPill } from '@airlock/shared-ui'
import { governanceApi } from '@airlock/shared-ui'
import { Activity, AlertTriangle, CheckCircle, Eye, BarChart3 } from 'lucide-react'

export default function ProxyMonitor() {
  const { data: stats } = useQuery({
    queryKey: ['proxy-stats'],
    queryFn: () => governanceApi.get('/proxy/stats').then(r => r.data),
  })

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Live Feed</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          Proxy Monitor
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Real-time request monitoring and audit trail</p>
      </motion.div>

      {stats ? (
        <KpiGrid columns={4}>
          <KpiCard label="Total Requests" value={stats.totalToday || 0} icon={<Activity className="w-5 h-5" />} />
          <KpiCard label="Blocked" value={stats.blockedToday || 0} icon={<AlertTriangle className="w-5 h-5" />} variant="danger" />
          <KpiCard label="Warned" value={stats.warnedToday || 0} icon={<Eye className="w-5 h-5" />} variant="warning" />
          <KpiCard label="Allowed" value={stats.allowedToday || 0} icon={<CheckCircle className="w-5 h-5" />} variant="success" />
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
        <Card title="Proxy Status" subtitle="Gateway health and connectivity">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Gateway Status', value: <StatusPill status={stats?.gatewayStatus || 'unknown'} pulsing /> },
              { label: 'Redis Cache', value: <StatusPill status={stats?.redisStatus || 'unknown'} /> },
              { label: 'Queue Depth', value: stats?.queueDepth || 0 },
              { label: 'Active Streams', value: stats?.activeStreams || 0 },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">{item.label}</p>
                <p className="text-sm font-medium text-[var(--foreground)]">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}
