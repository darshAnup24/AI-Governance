"use client"

import * as React from "react"
import {
  ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, SortingState, useReactTable,
} from "@tanstack/react-table"
import { Ban, CheckCircle2, Flag, Scissors, Search, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { auditLogs, type AuditLog, type PromptDecision } from "@/lib/governance-data"

const decisionConfig: Record<PromptDecision, { icon: React.ElementType; className: string }> = {
  blocked:  { icon: Ban,          className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  allowed:  { icon: CheckCircle2, className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  redacted: { icon: Scissors,     className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  flagged:  { icon: Flag,         className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20" },
}

function DecisionBadge({ decision }: { decision: PromptDecision }) {
  const { icon: Icon, className } = decisionConfig[decision]
  return (
    <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 gap-1", className)}>
      <Icon className="size-3" />
      <span className="capitalize">{decision}</span>
    </Badge>
  )
}

function RiskScore({ score }: { score: number }) {
  const color = score >= 80 ? "text-red-500" : score >= 60 ? "text-orange-500" : score >= 40 ? "text-yellow-500" : "text-green-500"
  return <span className={cn("text-xs font-semibold tabular-nums", color)}>{score}</span>
}

const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: "id",
    header: "Event ID",
    cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.id}</span>,
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => <span className="text-xs font-medium">{row.original.action}</span>,
  },
  {
    accessorKey: "decision",
    header: "Decision",
    cell: ({ row }) => <DecisionBadge decision={row.original.decision} />,
  },
  {
    accessorKey: "actor",
    header: "Actor",
    cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.actor}</span>,
  },
  {
    accessorKey: "model",
    header: "Model",
    cell: ({ row }) => <span className="text-xs">{row.original.model}</span>,
  },
  {
    accessorKey: "riskScore",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Risk Score <ArrowUpDown className="ml-1 size-3" />
      </Button>
    ),
    cell: ({ row }) => <RiskScore score={row.original.riskScore} />,
  },
  {
    accessorKey: "latencyMs",
    header: "Latency",
    cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{row.original.latencyMs}ms</span>,
  },
  {
    accessorKey: "timestamp",
    header: "Time",
    cell: ({ row }) => (
      <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
        {new Date(row.original.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    ),
  },
]

export function AuditLogTable() {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "timestamp", desc: true }])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 8 })

  const table = useReactTable({
    data: auditLogs,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground ml-auto">
          {table.getFilteredRowModel().rows.length} events
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map(h => (
                  <TableHead key={h.id} className="text-xs h-8">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-20 text-center text-xs text-muted-foreground">
                  No audit logs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {pagination.pageSize} of {table.getFilteredRowModel().rows.length}
        </p>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="size-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="size-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
