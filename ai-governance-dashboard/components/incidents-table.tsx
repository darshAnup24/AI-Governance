"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table"
import { toast } from "sonner"
import { z } from "zod"
import {
  AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Columns, Search, Eye,
  CheckCircle2, Clock, ShieldAlert,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useIsMobile } from "@/hooks/use-mobile"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer"
import { cn } from "@/lib/utils"
import type { Incident, SeverityLevel, IncidentStatus } from "@/lib/governance-data"
import { incidents } from "@/lib/governance-data"

const severityConfig: Record<SeverityLevel, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  high:     { label: "High",     className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  medium:   { label: "Medium",   className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20" },
  low:      { label: "Low",      className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  info:     { label: "Info",     className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
}

const statusConfig: Record<IncidentStatus, { label: string; icon: React.ElementType; className: string }> = {
  open:       { label: "Open",       icon: AlertTriangle, className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  reviewing:  { label: "Reviewing",  icon: Clock,         className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  resolved:   { label: "Resolved",   icon: CheckCircle2,  className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  escalated:  { label: "Escalated",  icon: ShieldAlert,   className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
}

function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  const cfg = severityConfig[severity]
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium px-1.5 py-0", cfg.className)}>
      {cfg.label}
    </Badge>
  )
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const cfg = statusConfig[status]
  const Icon = cfg.icon
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium px-1.5 py-0 gap-1", cfg.className)}>
      <Icon className="size-3" />
      {cfg.label}
    </Badge>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

// Detail panel
function IncidentDetailPanel({
  incident,
  open,
  onClose,
}: { incident: Incident | null; open: boolean; onClose: () => void }) {
  const isMobile = useIsMobile()

  if (!incident) return null

  const content = (
    <div className="flex flex-col gap-4 px-4 py-2 text-sm overflow-y-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
        <span className="text-xs text-muted-foreground ml-auto font-mono">{incident.id}</span>
      </div>

      <div className="grid gap-3">
        <div className="rounded-lg border p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
          <p className="text-sm leading-relaxed">{incident.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Model", value: incident.model },
            { label: "Policy Triggered", value: incident.policy },
            { label: "Prompt ID", value: incident.promptId },
            { label: "Reviewer", value: incident.reviewer ?? "Unassigned" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border p-2.5 bg-muted/20">
              <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{label}</p>
              <p className="text-xs font-medium truncate">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border p-2.5 bg-muted/20">
          <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Timestamp</p>
          <p className="text-xs font-mono">{formatTime(incident.timestamp)}</p>
        </div>
      </div>

      <Separator />

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => { toast.success(`Incident ${incident.id} assigned to you`); onClose() }}>
          Assign to Me
        </Button>
        <Button size="sm" variant="outline" onClick={() => { toast.success("Incident resolved"); onClose() }}>
          Resolve
        </Button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent>
          <DrawerHeader className="px-4">
            <DrawerTitle className="text-sm font-semibold line-clamp-2">{incident.title}</DrawerTitle>
            <DrawerDescription className="text-xs">Incident Detail</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[400px] sm:w-[480px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <SheetTitle className="text-sm font-semibold line-clamp-2">{incident.title}</SheetTitle>
          <SheetDescription className="text-xs">Incident Detail</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-3">
          {content}
        </div>
      </SheetContent>
    </Sheet>
  )
}

const columns: ColumnDef<Incident>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.id}</span>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: "Incident",
    cell: ({ row }) => (
      <span className="text-sm font-medium line-clamp-1 max-w-[260px]">{row.original.title}</span>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "severity",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Severity <ArrowUpDown className="ml-1 size-3" />
      </Button>
    ),
    cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "model",
    header: "Model",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.model}</span>,
  },
  {
    accessorKey: "policy",
    header: "Policy",
    cell: ({ row }) => <span className="text-xs">{row.original.policy}</span>,
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Time <ArrowUpDown className="ml-1 size-3" />
      </Button>
    ),
    cell: ({ row }) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(row.original.timestamp)}</span>,
  },
]

export function IncidentsTable() {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 8 })
  const [selectedIncident, setSelectedIncident] = React.useState<Incident | null>(null)

  const table = useReactTable({
    data: incidents,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 lg:px-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="incident-search"
              placeholder="Search incidents..."
              value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
              onChange={(e) => table.getColumn("title")?.setFilterValue(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          <Select
            value={(table.getColumn("severity")?.getFilterValue() as string) ?? "all"}
            onValueChange={(v) => table.getColumn("severity")?.setFilterValue(v === "all" ? "" : v)}
          >
            <SelectTrigger size="sm" className="h-8 w-32 text-xs" id="severity-filter">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs ml-auto">
                <Columns className="size-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {table.getAllColumns().filter(c => c.getCanHide()).map(column => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize text-xs"
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(!!v)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border mx-4 lg:mx-6">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} className="text-xs h-9">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                  <TableHead className="text-xs h-9 w-8" />
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map(row => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setSelectedIncident(row.original)}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className="py-2.5" onClick={e => { if (cell.column.id === "select") e.stopPropagation() }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                    <TableCell className="py-2.5">
                      <Eye className="size-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-24 text-center text-sm text-muted-foreground">
                    No incidents found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 lg:px-6 pb-1">
          <p className="text-xs text-muted-foreground hidden sm:block">
            {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} selected
          </p>
          <div className="flex items-center gap-4 ml-auto">
            <p className="text-xs text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="size-7" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                <ChevronsLeft className="size-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="size-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="size-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <ChevronRight className="size-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="size-7" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                <ChevronsRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <IncidentDetailPanel
        incident={selectedIncident}
        open={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </>
  )
}
