"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { IncidentsTable } from "@/components/incidents-table"
import { auditLogs } from "@/lib/governance-data"
import { Card, CardContent } from "@/components/ui/card"
import { Ban, Flag, Scissors, CheckCircle2 } from "lucide-react"

export function IncidentsEnforcementHeader({ className }: { className?: string }) {
  return (
    <SectionHeader
      icon={AlertTriangle}
      title="Incidents & Enforcement"
      description="Monitor active incidents and runtime enforcement decisions — blocked prompts, flagged outputs, and escalations."
      viewAllHref="/dashboard/incidents"
      className={className}
    />
  )
}

function EnforcementMetric({
  icon: Icon,
  label,
  value,
  tint,
  ring,
}: {
  icon: React.ElementType
  label: string
  value: number
  tint: string
  ring: string
}) {
  return (
    <Card>
      <CardContent className="px-3 py-2.5 flex items-center gap-2.5">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md bg-muted/40 ring-1 ${ring}`}>
          <Icon className={`size-3.5 ${tint}`} />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground font-medium leading-none">{label}</p>
          <p className="text-base font-semibold tabular-nums leading-tight mt-0.5">{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function IncidentsEnforcementModule() {
  const counts = React.useMemo(() => {
    const acc = { blocked: 0, flagged: 0, redacted: 0, allowed: 0 }
    for (const l of auditLogs) acc[l.decision] += 1
    return acc
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 px-4 lg:px-6 @xl/main:grid-cols-4">
        <EnforcementMetric icon={Ban}          label="Blocked (24h)"  value={counts.blocked}  tint="text-red-600 dark:text-red-400"     ring="ring-red-500/20" />
        <EnforcementMetric icon={Scissors}     label="Redacted (24h)" value={counts.redacted} tint="text-orange-600 dark:text-orange-400" ring="ring-orange-500/20" />
        <EnforcementMetric icon={Flag}        label="Flagged (24h)"  value={counts.flagged}  tint="text-amber-600 dark:text-amber-400"   ring="ring-amber-500/20" />
        <EnforcementMetric icon={CheckCircle2} label="Allowed (24h)"  value={counts.allowed}  tint="text-emerald-600 dark:text-emerald-400" ring="ring-emerald-500/20" />
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardContent className="p-0">
            <IncidentsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
