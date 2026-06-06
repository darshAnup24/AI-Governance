import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Card, Button, Badge, EmptyState, SectionLabel, fadeInUp, stagger,
} from '@airlock/shared-ui'
import { governanceApi } from '@airlock/shared-ui'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { Library, Check, Building2, Shield } from 'lucide-react'

const INDUSTRY_LABELS: Record<string, string> = {
  FINANCE: 'Finance & Banking',
  HEALTHCARE: 'Healthcare',
  TECHNOLOGY: 'Technology',
  GOVERNMENT: 'Government',
  RETAIL: 'Retail & E-commerce',
  EDUCATION: 'Education',
}

const INDUSTRY_COLORS: Record<string, string> = {
  FINANCE: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600',
  HEALTHCARE: 'border-blue-500/20 bg-blue-500/5 text-blue-600',
  TECHNOLOGY: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-600',
  GOVERNMENT: 'border-purple-500/20 bg-purple-500/5 text-purple-600',
  RETAIL: 'border-amber-500/20 bg-amber-500/5 text-amber-600',
  EDUCATION: 'border-rose-500/20 bg-rose-500/5 text-rose-600',
}

export default function PolicyTemplates() {
  const { currentWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['policy-templates', selectedIndustry],
    queryFn: () =>
      governanceApi.get('/policy-templates', {
        params: selectedIndustry ? { industry: selectedIndustry } : {},
      }).then(r => r.data),
  })

  const applyMutation = useMutation({
    mutationFn: (templateId: string) =>
      governanceApi.post(`/policy-templates/${templateId}/apply`, {
        workspaceId: currentWorkspace?.id,
      }),
    onSuccess: (_data, templateId) => {
      setAppliedIds((prev) => new Set(prev).add(templateId))
      queryClient.invalidateQueries({ queryKey: ['policies'] })
    },
  })

  const templates = data?.templates || []

  const groupedByIndustry: Record<string, any[]> = {}
  for (const tpl of templates) {
    if (!groupedByIndustry[tpl.industry]) groupedByIndustry[tpl.industry] = []
    groupedByIndustry[tpl.industry].push(tpl)
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Library</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          Policy Templates
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Industry-standard governance templates — one-click apply</p>
      </motion.div>

      <motion.div variants={fadeInUp} className="flex flex-wrap gap-2">
        {Object.keys(INDUSTRY_LABELS).map((ind) => (
          <button
            key={ind}
            onClick={() => setSelectedIndustry(selectedIndustry === ind ? null : ind)}
            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all duration-200 ${
              selectedIndustry === ind
                ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white border-transparent'
                : 'border-[var(--border)] bg-white text-[var(--muted-foreground)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)]'
            }`}
          >
            {INDUSTRY_LABELS[ind]}
          </button>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8">
          <div className="animate-pulse space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <div className="h-5 w-40 bg-[var(--muted)] rounded mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(j => <div key={j} className="h-32 bg-[var(--muted)] rounded-2xl" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Library className="w-8 h-8" />}
            title="No templates available"
            description="Policy templates will be available for quick setup based on your industry and regulatory requirements."
          />
        </Card>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedByIndustry).map(([industry, industryTemplates]) => (
            <motion.div key={industry} variants={fadeInUp}>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">{INDUSTRY_LABELS[industry] || industry}</h2>
                <span className="text-xs text-[var(--muted-foreground)]">({industryTemplates.length} templates)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {industryTemplates.map((tpl: any) => {
                  const isApplied = appliedIds.has(tpl.id)
                  return (
                    <div
                      key={tpl.id}
                      className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] flex items-center justify-center">
                          <Shield className="w-5 h-5 text-white" />
                        </div>
                        <Badge variant={isApplied ? 'success' : 'accent'}>
                          {isApplied ? 'Applied' : tpl.category || 'Standard'}
                        </Badge>
                      </div>
                      <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">{tpl.name}</h3>
                      <p className="text-sm text-[var(--muted-foreground)] mb-4 line-clamp-2">{tpl.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--muted-foreground)]">{tpl.policyCount || 0} policies</span>
                        <Button
                          size="sm"
                          variant={isApplied ? 'outline' : 'primary'}
                          disabled={isApplied}
                          onClick={() => applyMutation.mutate(tpl.id)}
                          loading={applyMutation.isPending}
                          icon={isApplied ? <Check className="w-3.5 h-3.5" /> : undefined}
                        >
                          {isApplied ? 'Applied' : 'Apply'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
