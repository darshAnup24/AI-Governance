"use client"

import * as React from "react"
import {
  ShieldCheck, AlertTriangle, Flag, Zap, KeyRound, ScrollText,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { auditTimeline, type AuditTimelineEvent } from "@/lib/governance-data"
import { SectionHeader } from "@/components/section-header"
import { ChartRiskTrend } from "@/components/chart-risk-trend"

const typeConfig: Record<AuditTimelineEvent["type"], { icon: React.ElementType; tint: string; ring: string; label: string }> = {
  enforcement: { icon: ShieldCheck,   tint: "text-blue-600 dark:text-blue-400",     ring: "ring-blue-500/20",   label: "Enforcement" },
  incident:    { icon: AlertTriangle, tint: "text-red-600 dark:text-red-400",       ring: "ring-red-500/20",    label: "Incident"    },
  approval:    { icon: Flag,          tint: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20", label: "Approval"   },
  policy:      { icon: ScrollText,    tint: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20", label: "Policy"      },
  access:      { icon: KeyRound,      tint: "text-amber-600 dark:text-amber-400",   ring: "ring-amber-500/20",  label: "Access"      },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function AuditTimelineHeader({ className }: { className?: string }) {
  return (
    <SectionHeader
      icon={ScrollText}
      title="Audit Trail & Activity"
      description="Recent governance actions, policy changes, reviewer activity, and runtime enforcement events."
      viewAllHref="/dashboard/audit-logs"
      className={className}
    />
  )
}

export function AuditTimelineModule() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @3xl/main:grid-cols-5">
      <Card className="@3xl/main:col-span-3">
        <CardContent className="px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Runtime traffic</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" /> Allowed
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--severity-critical))]" /> Blocked
              </span>
            </div>
          </div>
          <ChartRiskTrend />
        </CardContent>
      </Card>

      <Card className="@3xl/main:col-span-2">
        <CardContent className="px-4 py-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Activity timeline</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Live</Badge>
          </div>

          <div className="relative pl-4">
            <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-border" />
            <div className="flex flex-col">
              {auditTimeline.slice(0, 8).map(ev => {
                const cfg = typeConfig[ev.type]
                const Icon = cfg.icon
                return (
                  <div key={ev.id} className="relative flex items-start gap-2.5 py-2">
                    <div className={cn(
                      "absolute -left-4 top-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background ring-1",
                      cfg.ring,
                    )}>
                      <Icon className={cn("size-2.5", cfg.tint)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug line-clamp-1">{ev.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        <span className="font-mono">{ev.id}</span>
                        <span className="mx-1">·</span>
                        <span>{ev.actor}</span>
                        <span className="mx-1">·</span>
                        <span>{ev.resource}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums">{formatTime(ev.timestamp)}</p>
                      {ev.meta && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5 border-border/60">
                          {ev.meta}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <Button variant="ghost" size="sm" className="h-7 text-xs self-end -mb-1 -mr-2 gap-1">
            Open audit log
            <Zap className="size-3" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
