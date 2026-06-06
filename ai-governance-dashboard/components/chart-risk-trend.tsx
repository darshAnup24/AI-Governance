"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { riskTrendData } from "@/lib/governance-data"
import { useIsMobile } from "@/hooks/use-mobile"

const chartConfig = {
  blocked: {
    label: "Blocked",
    color: "hsl(var(--severity-critical))",
  },
  allowed: {
    label: "Allowed",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

type TimeRange = "7d" | "14d" | "30d"

export function ChartRiskTrend() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState<TimeRange>("30d")

  const filtered = riskTrendData.slice(
    timeRange === "7d" ? -7 : timeRange === "14d" ? -14 : 0
  )

  return (
    <Card className="@container/card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-sm font-semibold">Runtime Traffic</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Blocked vs. allowed prompt requests
            </CardDescription>
          </div>

          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v as TimeRange)}
            variant="outline"
            className="hidden @[540px]/card:flex h-7"
          >
            <ToggleGroupItem value="7d" className="text-xs px-2.5 h-7">7d</ToggleGroupItem>
            <ToggleGroupItem value="14d" className="text-xs px-2.5 h-7">14d</ToggleGroupItem>
            <ToggleGroupItem value="30d" className="text-xs px-2.5 h-7">30d</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger size="sm" className="w-28 h-7 text-xs @[540px]/card:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="14d">Last 14 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-4">
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <AreaChart data={filtered} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="fillAllowed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-allowed)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-allowed)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillBlocked" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-blocked)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-blocked)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => {
                const d = new Date(v)
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }}
            />
            <ChartTooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(v) =>
                    new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  }
                />
              }
            />
            <Area
              dataKey="allowed"
              type="monotone"
              fill="url(#fillAllowed)"
              stroke="var(--color-allowed)"
              strokeWidth={1.5}
              stackId="a"
            />
            <Area
              dataKey="blocked"
              type="monotone"
              fill="url(#fillBlocked)"
              stroke="var(--color-blocked)"
              strokeWidth={1.5}
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
