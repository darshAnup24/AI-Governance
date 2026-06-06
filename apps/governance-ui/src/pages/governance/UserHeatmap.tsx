import { motion } from 'framer-motion'
import { Card, EmptyState, SectionLabel } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { Activity } from 'lucide-react'

export default function UserHeatmap() {
  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Analytics</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          User Heatmap
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Usage patterns and behavioral analytics</p>
      </motion.div>
      <motion.div variants={fadeInUp}>
        <Card>
          <EmptyState
            icon={<Activity className="w-8 h-8" />}
            title="No usage data yet"
            description="User activity heatmap will display here once AI models are being used. Track query patterns, peak usage times, and user behavior."
          />
        </Card>
      </motion.div>
    </motion.div>
  )
}
