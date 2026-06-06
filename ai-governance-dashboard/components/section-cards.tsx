"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { kpiData } from "@/lib/governance-data"
import {
  ShieldCheck, AlertTriangle, Ban, Activity, Bot, CheckSquare,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react"

type KpiKey = keyof typeof kpiData

interface KpiCardConfig {
  key: KpiKey
  icon: React.ElementType
  iconColor: string
  format?: (v: number) => string
  suffix?: string
  alertColor?: string
}

const kpiCards: KpiCardConfig[] = [
  { key: "activePolicies", icon: ShieldCheck, iconColor: "text-blue-500", format: (v) => v.toString() },
  { key: "runtimeIncidents", icon: AlertTriangle, iconColor: "text-amber-500", alertColor: "text-destructive", format: (v) => v.toString() },
  { key: "blockedPrompts", icon: Ban, iconColor: "text-red-500", format: (v) => v.toLocaleString() },
  { key: "avgRiskScore", icon: Activity, iconColor: "text-purple-500", format: (v) => v.toString(), suffix: "/100" },
  { key: "activeModels", icon: Bot, iconColor: "text-cyan-500", format: (v) => v.toString() },
  { key: "complianceHealth", icon: CheckSquare, iconColor: "text-green-500", format: (v) => v.toString(), suffix: "%" },
]

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return (
    <Badge variant="outline" className="gap-1 px-1.5 text-muted-foreground">
      <Minus className="size-3" />
      <span>No change</span>
    </Badge>
  )
  const isPositive = delta > 0
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 px-1.5", isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}
    >
      {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      <span>{isPositive ? "+" : ""}{delta}</span>
    </Badge>
  )
}

export function SectionCards() {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 lg:px-6 @xl/main:grid-cols-3 @5xl/main:grid-cols-6">
      {kpiCards.map(({ key, icon: Icon, iconColor, format, suffix, alertColor }) => {
        const item = kpiData[key]
        const displayValue = format ? format(item.value) : item.value.toString()

        return (
          <Card
            key={key}
            className="@container/card relative overflow-hidden border bg-card hover:border-border/80 transition-colors duration-150"
          >
            {/* Subtle top gradient strip */}
            <div className={cn("absolute top-0 left-0 right-0 h-0.5 opacity-60", {
              "bg-gradient-to-r from-blue-500/60 to-blue-400/20": key === "activePolicies",
              "bg-gradient-to-r from-amber-500/60 to-amber-400/20": key === "runtimeIncidents",
              "bg-gradient-to-r from-red-500/60 to-red-400/20": key === "blockedPrompts",
              "bg-gradient-to-r from-purple-500/60 to-purple-400/20": key === "avgRiskScore",
              "bg-gradient-to-r from-cyan-500/60 to-cyan-400/20": key === "activeModels",
              "bg-gradient-to-r from-green-500/60 to-green-400/20": key === "complianceHealth",
            })} />

            <CardHeader className="pb-1 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium text-muted-foreground leading-none">
                  {item.label}
                </CardDescription>
                <Icon className={cn("size-3.5 shrink-0", iconColor)} />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <CardTitle className={cn(
                    "text-2xl font-semibold tabular-nums leading-none @[140px]/card:text-3xl",
                    alertColor && item.delta > 0 ? alertColor : ""
                  )}>
                    {displayValue}
                    {suffix && <span className="text-sm font-normal text-muted-foreground ml-0.5">{suffix}</span>}
                  </CardTitle>
                </div>
                <DeltaBadge delta={item.delta} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">vs yesterday</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
