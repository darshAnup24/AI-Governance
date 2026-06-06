import { motion } from 'framer-motion'
import { Card, EmptyState, SectionLabel } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { BarChart3 } from 'lucide-react'

export default function Reports() {
  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Analytics</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          Reports
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Governance reports and analytics</p>
      </motion.div>
      <motion.div variants={fadeInUp}>
        <Card>
          <EmptyState
            icon={<BarChart3 className="w-8 h-8" />}
            title="No reports generated"
            description="Generate compliance reports, risk assessments, and governance summaries for stakeholders and auditors."
          />
        </Card>
      </motion.div>
    </motion.div>
  )
}
