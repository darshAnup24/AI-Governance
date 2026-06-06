"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, ChevronDown, Circle } from "lucide-react"

interface SiteHeaderProps {
  title?: string
  subtitle?: string
}

export function SiteHeader({ title = "Dashboard", subtitle }: SiteHeaderProps) {
  return (
    <header className="flex h-[var(--header-height,3.25rem)] shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur-sm px-4 lg:px-6 sticky top-0 z-40">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mx-1 h-4" />
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-sm font-medium text-foreground truncate">{title}</h1>
        {subtitle && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground truncate">{subtitle}</span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Environment selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-medium hidden sm:flex">
              <Circle className="size-2 fill-green-500 text-green-500" />
              Production
              <ChevronDown className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem>
              <Circle className="size-2 fill-green-500 text-green-500 mr-2" />
              Production
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Circle className="size-2 fill-yellow-500 text-yellow-500 mr-2" />
              Staging
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Circle className="size-2 fill-blue-500 text-blue-500 mr-2" />
              Development
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* System status */}
        <Badge variant="outline" className="h-7 px-2 gap-1.5 text-xs font-medium hidden md:flex border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/5">
          <Circle className="size-1.5 fill-current" />
          All Systems Operational
        </Badge>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="h-7 w-7 relative">
          <Bell className="size-4" />
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive text-[9px] text-white font-bold flex items-center justify-center">
            4
          </span>
          <span className="sr-only">Notifications</span>
        </Button>
      </div>
    </header>
  )
}
