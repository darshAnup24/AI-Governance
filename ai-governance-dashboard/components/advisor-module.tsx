"use client"

import * as React from "react"
import { Sparkles, TriangleAlert, AlertTriangle, CheckCircle2, Info, X, ChevronRight, type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { advisorRecommendations, type AdvisorTone } from "@/lib/governance-data"
import { SectionHeader } from "@/components/section-header"

const toneConfig: Record<AdvisorTone, { icon: LucideIcon; tint: string; ring: string; badge: string; label: string }> = {
  critical: {
    icon: AlertTriangle,
    tint: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/20",
    badge: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5",
    label: "Critical",
  },
  warning: {
    icon: TriangleAlert,
    tint: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
    badge: "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5",
    label: "Action needed",
  },
  info: {
    icon: Info,
    tint: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/20",
    badge: "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5",
    label: "Suggested",
  },
  success: {
    icon: CheckCircle2,
    tint: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
    badge: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
    label: "Healthy",
  },
}

export function AdvisorHeader({ className }: { className?: string }) {
  return (
    <SectionHeader
      icon={Sparkles}
      title="AI Advisor"
      description="Guided governance — recommended actions, missing policy alerts, and posture guidance."
      viewAllHref="/dashboard/advisor"
      className={className}
    />
  )
}

export function AdvisorModule() {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())

  const visible = React.useMemo(
    () => advisorRecommendations.filter(r => !dismissed.has(r.id)),
    [dismissed],
  )

  return (
    <div className="grid grid-cols-1 gap-3 px-4 lg:px-6 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
      {visible.map(rec => {
        const cfg = toneConfig[rec.tone]
        const Icon = cfg.icon
        return (
          <Card
            key={rec.id}
            className={cn(
              "relative hover:border-border/80 transition-colors duration-150 group",
            )}
          >
            <CardContent className="px-4 py-4 flex flex-col gap-3 h-full">
              <div className="flex items-start gap-2.5">
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40 ring-1",
                  cfg.ring,
                )}>
                  <Icon className={cn("size-3.5", cfg.tint)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    cfg.tint,
                  )}>
                    {cfg.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rec.category}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mt-1 -mr-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setDismissed(prev => new Set(prev).add(rec.id))}
                  aria-label="Dismiss"
                >
                  <X className="size-3" />
                </Button>
              </div>

              <p className="text-sm font-medium leading-snug">{rec.title}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                {rec.description}
              </p>

              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-muted-foreground">{rec.impact}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 -mr-2">
                  {rec.cta}
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
