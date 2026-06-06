"use client"

import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { Search, ArrowUpDown, Building2, Bot, Database, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { models, vendors, datasets, agents } from "@/lib/governance-data"

type AssetKind = "models" | "vendors" | "datasets" | "agents"
type AssetRow = {
  kind: AssetKind
  id: string
  name: string
  vendor: string
  status: string
  meta: string
  risk?: number
  badgeClassName?: string
}

const kindMeta: Record<AssetKind, { icon: React.ElementType; label: string; color: string }> = {
  models:   { icon: Bot,       label: "Model",    color: "text-cyan-600 dark:text-cyan-400"   },
  vendors:  { icon: Building2, label: "Vendor",   color: "text-blue-600 dark:text-blue-400"   },
  datasets: { icon: Database,  label: "Dataset",  color: "text-violet-600 dark:text-violet-400"},
  agents:   { icon: Workflow,  label: "Agent",    color: "text-emerald-600 dark:text-emerald-400" },
}

const statusStyles: Record<string, string> = {
  active:       "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
  approved:     "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
  staging:      "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5",
  pending:      "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5",
  draft:        "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5",
  paused:       "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5",
  deprecated:   "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  restricted:   "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5",
  public:       "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
  internal:     "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5",
  confidential: "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5",
  restricted_ds:"border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5",
}

const allRows: AssetRow[] = [
  ...models.map<AssetRow>(m => ({
    kind: "models",
    id: m.id,
    name: m.name,
    vendor: m.vendor,
    status: m.status,
    meta: `${m.requestsToday.toLocaleString()} req/day · v${m.version}`,
    risk: m.riskScore,
    badgeClassName: statusStyles[m.status],
  })),
  ...vendors.map<AssetRow>(v => ({
    kind: "vendors",
    id: v.id,
    name: v.name,
    vendor: v.dataResidency,
    status: v.status,
    meta: `${v.models} model${v.models === 1 ? "" : "s"} · contract ${v.contract}`,
    risk: v.riskScore,
    badgeClassName: statusStyles[v.status],
  })),
  ...datasets.map<AssetRow>(d => ({
    kind: "datasets",
    id: d.id,
    name: d.name,
    vendor: d.source,
    status: d.classification,
    meta: `${d.rows.toLocaleString()} rows · ${d.lineageSteps} lineage steps`,
    badgeClassName: statusStyles[d.classification],
  })),
  ...agents.map<AssetRow>(a => ({
    kind: "agents",
    id: a.id,
    name: a.name,
    vendor: a.model,
    status: a.status,
    meta: `${a.runs.toLocaleString()} runs · ${a.successRate}% success`,
    badgeClassName: statusStyles[a.status],
  })),
]

const columns: ColumnDef<AssetRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Asset <ArrowUpDown className="ml-1 size-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const meta = kindMeta[row.original.kind]
      const Icon = meta.icon
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("size-3.5 shrink-0", meta.color)} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{row.original.name}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{row.original.id} · {meta.label}</p>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "vendor",
    header: "Source / Owner",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.vendor}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0 capitalize", row.original.badgeClassName)}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "meta",
    header: "Detail",
    cell: ({ row }) => <span className="text-[11px] text-muted-foreground whitespace-nowrap">{row.original.meta}</span>,
  },
  {
    accessorKey: "risk",
    header: "Risk",
    cell: ({ row }) => {
      if (row.original.risk === undefined) return <span className="text-[11px] text-muted-foreground">—</span>
      const r = row.original.risk
      const color = r >= 80 ? "text-red-500" : r >= 60 ? "text-orange-500" : r >= 40 ? "text-amber-500" : "text-emerald-500"
      return <span className={cn("text-xs font-semibold tabular-nums", color)}>{r}</span>
    },
  },
]

export function InventoryTable() {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [activeKind, setActiveKind] = React.useState<AssetKind | "all">("all")

  const filtered = React.useMemo(
    () => (activeKind === "all" ? allRows : allRows.filter(r => r.kind === activeKind)),
    [activeKind],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const counts = React.useMemo(() => {
    const acc: Record<string, number> = { all: allRows.length }
    for (const r of allRows) acc[r.kind] = (acc[r.kind] ?? 0) + 1
    return acc
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
        <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as AssetKind | "all")}>
          <TabsList className="h-8">
            <TabsTrigger value="all"     className="text-xs h-6 px-2.5">All <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{counts.all}</span></TabsTrigger>
            <TabsTrigger value="models"  className="text-xs h-6 px-2.5">Models <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{counts.models}</span></TabsTrigger>
            <TabsTrigger value="vendors" className="text-xs h-6 px-2.5">Vendors <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{counts.vendors}</span></TabsTrigger>
            <TabsTrigger value="datasets" className="text-xs h-6 px-2.5">Datasets <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{counts.datasets}</span></TabsTrigger>
            <TabsTrigger value="agents"  className="text-xs h-6 px-2.5">Agents <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{counts.agents}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search inventory..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border mx-4 lg:mx-6">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map(h => (
                  <TableHead key={h.id} className="text-xs h-9">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  No assets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
