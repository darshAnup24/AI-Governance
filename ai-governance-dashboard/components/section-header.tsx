import * as React from "react"
import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  icon: LucideIcon
  title: string
  description?: string
  meta?: React.ReactNode
  viewAllHref?: string
  viewAllLabel?: string
  className?: string
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  meta,
  viewAllHref,
  viewAllLabel = "View all",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 lg:px-6", className)}>
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold tracking-tight text-foreground leading-none">
              {title}
            </h2>
            {meta}
          </div>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{description}</p>
          )}
        </div>
      </div>

      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors shrink-0 mt-1"
        >
          {viewAllLabel}
          <ChevronRight className="size-3" />
        </Link>
      )}
    </div>
  )
}
