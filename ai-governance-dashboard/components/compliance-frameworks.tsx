"use client"

import * as React from "react"
import { Compass, ShieldCheck, TriangleAlert, Flag, Activity } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { frameworks } from "@/lib/governance-data"
import { SectionHeader } from "@/components/section-header"

const healthConfig: Record<string, { label: string; className: string; ring: string; bar: string }> = {
  "on-track": {
    label: "On track",
    className: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
    ring: "ring-emerald-500/20",
    bar: "[&>div]:bg-emerald-500",
  },
  "at-risk": {
    label: "At risk",
    className: "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5",
    ring: "ring-amber-500/20",
    bar: "[&>div]:bg-amber-500",
  },
  "behind": {
    label: "Behind",
    className: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5",
    ring: "ring-red-500/20",
    bar: "[&>div]:bg-red-500",
  },
  "complete": {
    label: "Complete",
    className: "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5",
    ring: "ring-blue-500/20",
    bar: "[&>div]:bg-blue-500",
  },
}

function readinessDonut({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const r = 22
  const c = 2 * Math.PI * r
  const offset = c - (v / 100) * c
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 50 50" className="h-full w-full -rotate-90">
        <circle cx="25" cy="25" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
        <circle
          cx="25"
          cy="25"
          r={r}
          fill="none"
          stroke={v >= 90 ? "hsl(var(--chart-2))" : v >= 75 ? "hsl(var(--chart-1))" : "hsl(var(--severity-medium))"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-semibold tabular-nums">{v}%</span>
      </div>
    </div>
  )
}

export function ComplianceFrameworkHeader({ className }: { className?: string }) {
  return (
    <SectionHeader
      icon={Compass}
      title="Compliance Frameworks"
      description="Track readiness against ISO 42001, NIST AI RMF, EU AI Act, SOC 2, and internal governance policy."
      viewAllHref="/dashboard/compliance"
      className={className}
    />
  )
}

export function ComplianceFrameworksModule() {
  const overall = Math.round(
    frameworks.reduce((acc, f) => acc + (f.controlsPassed / f.controls) * 100, 0) / frameworks.length,
  )
  const openControls = frameworks.reduce((acc, f) => acc + (f.controls - f.controlsPassed), 0)
  const atRisk = frameworks.filter(f => f.health === "at-risk" || f.health === "behind").length

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 px-4 lg:px-6 @xl/main:grid-cols-3">
        <Card>
          <CardContent className="px-4 py-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Overall readiness</p>
              <p className="text-lg font-semibold tabular-nums leading-tight">{overall}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 ring-1 ring-amber-500/20">
              <Flag className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Open controls</p>
              <p className="text-lg font-semibold tabular-nums leading-tight">{openControls}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="@xl/main:col-span-1">
          <CardContent className="px-4 py-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500/10 ring-1 ring-red-500/20">
              <TriangleAlert className="size-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Frameworks at risk</p>
              <p className="text-lg font-semibold tabular-nums leading-tight">{atRisk}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 lg:px-6 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {frameworks.map(f => {
          const pct = Math.round((f.controlsPassed / f.controls) * 100)
          const cfg = healthConfig[f.health]
          const remaining = f.controls - f.controlsPassed
          return (
            <Card key={f.id} className="hover:border-border/80 transition-colors">
              <CardContent className="px-4 py-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  {readinessDonut({ value: pct })}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight truncate">{f.shortName}</p>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", cfg.className)}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {f.controlsPassed} of {f.controls} controls · {f.domain}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Progress value={pct} className={cn("h-1.5 bg-muted", cfg.bar)} />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Owner · {f.owner}</span>
                    <span className="tabular-nums">Due {f.dueDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs flex-1">
                    View {remaining} open
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    <Activity className="size-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
