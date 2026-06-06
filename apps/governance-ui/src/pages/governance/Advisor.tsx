import { motion } from 'framer-motion'
import { Card, EmptyState, SectionLabel } from '@airlock/shared-ui'
import { fadeInUp, stagger } from '@airlock/shared-ui'
import { Bot } from 'lucide-react'

export default function Advisor() {
  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Insights</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          AI Advisor
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Intelligent recommendations and insights</p>
      </motion.div>
      <motion.div variants={fadeInUp}>
        <Card>
          <EmptyState
            icon={<Bot className="w-8 h-8" />}
            title="AI Advisor ready"
            description="The AI Advisor analyzes your governance posture and provides actionable recommendations. Insights will appear once sufficient data is available."
          />
        </Card>
      </motion.div>
    </motion.div>
  )
}
