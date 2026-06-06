"use client"

import * as React from "react"
import { TriangleAlert, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { riskRollups, topActiveRisks, type SeverityLevel } from "@/lib/governance-data"
import { SectionHeader } from "@/components/section-header"

const severityColor: Record<SeverityLevel, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-amber-500",
  low:      "bg-emerald-500",
  info:     "bg-blue-500",
}

function TrendPill({ value }: { value: number }) {
  if (value === 0) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 text-muted-foreground">
        <Minus className="size-2.5" /> 0
      </Badge>
    )
  }
  const isUp = value > 0
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px] px-1.5 py-0",
        isUp ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
      )}
    >
      {isUp ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
      {isUp ? "+" : ""}{value}
    </Badge>
  )
}

function RollupBar({ critical, high, medium, low }: { critical: number; high: number; medium: number; low: number }) {
  const total = critical + high + medium + low
  if (total === 0) return <div className="h-1.5 rounded-full bg-muted" />
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
      {critical > 0 && <div className={cn(severityColor.critical)} style={{ width: `${(critical / total) * 100}%` }} />}
      {high > 0 && <div className={cn(severityColor.high)} style={{ width: `${(high / total) * 100}%` }} />}
      {medium > 0 && <div className={cn(severityColor.medium)} style={{ width: `${(medium / total) * 100}%` }} />}
      {low > 0 && <div className={cn(severityColor.low)} style={{ width: `${(low / total) * 100}%` }} />}
    </div>
  )
}

const sevBadge: Record<SeverityLevel, string> = {
  critical: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5",
  high:     "border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/5",
  medium:   "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5",
  low:      "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
  info:     "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5",
}

export function RiskOverviewHeader({ className }: { className?: string }) {
  return (
    <SectionHeader
      icon={TriangleAlert}
      title="Risk Overview"
      description="Operational visibility across use-case, model, vendor, policy, and runtime risk scoring."
      viewAllHref="/dashboard/risk"
      className={className}
    />
  )
}

export function RiskOverviewModule() {
  const totalCritical = riskRollups.reduce((a, r) => a + r.critical, 0)
  const totalHigh = riskRollups.reduce((a, r) => a + r.high, 0)

  return (
    <div className="grid grid-cols-1 gap-3 px-4 lg:px-6 @3xl/main:grid-cols-3">
      <Card className="@3xl/main:col-span-2">
        <CardContent className="px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Risk distribution by domain</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <span className="text-red-600 dark:text-red-400 font-semibold tabular-nums">{totalCritical}</span> critical
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                <span className="text-orange-600 dark:text-orange-400 font-semibold tabular-nums">{totalHigh}</span> high
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                across {riskRollups.length} domains
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-red-500" />C</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-orange-500" />H</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-amber-500" />M</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" />L</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {riskRollups.map(r => (
              <div key={r.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{r.label}</span>
                  <div className="flex items-center gap-2 text-muted-foreground tabular-nums">
                    <span className="text-[11px]">{r.critical + r.high + r.medium + r.low} open</span>
                    <TrendPill value={r.trend} />
                  </div>
                </div>
                <RollupBar critical={r.critical} high={r.high} medium={r.medium} low={r.low} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-4 py-4 flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Top active risks</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Highest priority items needing attention</p>
          </div>
          <div className="flex flex-col">
            {topActiveRisks.map(r => (
              <div key={r.id} className="flex items-start gap-2.5 py-2 border-b last:border-0">
                <div className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", severityColor[r.severity])} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-snug line-clamp-2">{r.title}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                    <span className="font-mono">{r.id}</span>
                    <span>·</span>
                    <span>{r.domain}</span>
                    <span>·</span>
                    <span>{r.owner}</span>
                    <span>·</span>
                    <span className="tabular-nums">{r.age}</span>
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize shrink-0", sevBadge[r.severity])}>
                  {r.severity}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
