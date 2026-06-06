"use client"

import * as React from "react"
import { Library, Bot, Database, Workflow, Building2, Plug } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { models, vendors, datasets, agents } from "@/lib/governance-data"
import { SectionHeader } from "@/components/section-header"

interface InventoryStat {
  label: string
  value: number | string
  hint: string
  icon: React.ElementType
  iconColor: string
  ring: string
}

const stats: InventoryStat[] = [
  {
    label: "Models",
    value: models.length,
    hint: `${models.filter(m => m.status === "active").length} active · ${models.filter(m => m.status === "staging").length} staging`,
    icon: Bot,
    iconColor: "text-cyan-600 dark:text-cyan-400",
    ring: "ring-cyan-500/20",
  },
  {
    label: "Active Vendors",
    value: vendors.filter(v => v.status === "approved").length,
    hint: `${vendors.length} total · ${vendors.filter(v => v.status === "pending").length} pending`,
    icon: Building2,
    iconColor: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/20",
  },
  {
    label: "Connected Datasets",
    value: datasets.length,
    hint: `${datasets.filter(d => d.piiDetected).length} contain PII`,
    icon: Database,
    iconColor: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
  },
  {
    label: "AI Agents",
    value: agents.length,
    hint: `${agents.filter(a => a.status === "active").length} active · ${agents.filter(a => a.status === "draft").length} draft`,
    icon: Workflow,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
  },
  {
    label: "Integrations",
    value: "18",
    hint: "SDKs · API keys · Webhooks",
    icon: Plug,
    iconColor: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
]

export function InventoryOverview() {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 lg:px-6 @xl/main:grid-cols-3 @5xl/main:grid-cols-5">
      {stats.map(({ label, value, hint, icon: Icon, iconColor, ring }) => (
        <Card
          key={label}
          className={cn(
            "group relative overflow-hidden hover:border-border/80 transition-colors duration-150",
          )}
        >
          <CardContent className="px-4 py-4 flex items-start gap-3">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 ring-1",
              ring,
            )}>
              <Icon className={cn("size-4", iconColor)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground leading-none">{label}</p>
              <p className="text-xl font-semibold tabular-nums leading-none mt-1.5">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">{hint}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function InventoryModuleHeader({ className }: { className?: string }) {
  return (
    <SectionHeader
      icon={Library}
      title="AI Inventory"
      description="Central visibility into models, vendors, datasets, agents, and integrations across the platform."
      viewAllHref="/dashboard/inventory"
      className={className}
    />
  )
}
