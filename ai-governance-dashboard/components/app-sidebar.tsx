"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Activity,
  AlertTriangle,
  ShieldCheck,
  Bot,
  Building2,
  ScrollText,
  FileBarChart,
  Settings,
  HelpCircle,
  Zap,
  Compass,
  Library,
  SlidersHorizontal,
  Flag,
  Workflow,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/nav-user"
import { Badge } from "@/components/ui/badge"

type BadgeVariant = "destructive" | "secondary" | "outline"

type NavItem = {
  title: string
  url: string
  icon: React.ElementType
  badge?: number
  badgeVariant?: BadgeVariant
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Monitoring",
    items: [
      { title: "Dashboard",        url: "/dashboard",              icon: LayoutDashboard },
      { title: "Runtime Monitor",  url: "/dashboard/runtime",      icon: Activity },
      { title: "Incidents",        url: "/dashboard/incidents",    icon: AlertTriangle, badge: 12, badgeVariant: "destructive" },
      { title: "Audit Logs",       url: "/dashboard/audit-logs",   icon: ScrollText },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Policies",         url: "/dashboard/policies",     icon: ShieldCheck },
      { title: "Compliance",       url: "/dashboard/compliance",   icon: Compass },
      { title: "AI Inventory",     url: "/dashboard/inventory",    icon: Library },
      { title: "Models",           url: "/dashboard/models",       icon: Bot },
    ],
  },
  {
    label: "Risk",
    items: [
      { title: "Vendor Risk",      url: "/dashboard/vendors",      icon: Building2, badge: 1, badgeVariant: "outline" },
      { title: "Use Cases",        url: "/dashboard/use-cases",    icon: Workflow },
      { title: "Assessments",      url: "/dashboard/assessments",  icon: SlidersHorizontal },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Reports",          url: "/dashboard/reports",      icon: FileBarChart },
      { title: "Settings",         url: "/dashboard/settings",     icon: Settings },
      { title: "Help & Docs",      url: "/dashboard/help",         icon: HelpCircle },
    ],
  },
]

const user = {
  name: "Sarah Chen",
  email: "s.chen@enterprise.ai",
  avatar: "",
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-2 h-10">
              <Link href="/dashboard">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
                  <Zap className="size-3.5" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-semibold text-sm tracking-tight">ShieldAI</span>
                  <span className="text-[10px] text-muted-foreground font-medium">Governance</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, idx) => (
          <React.Fragment key={group.label}>
            {idx > 0 && <SidebarSeparator />}
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.url ||
                    (item.url !== "/dashboard" && pathname.startsWith(item.url))
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Link href={item.url} className="flex items-center gap-2">
                          <item.icon className="size-4 shrink-0" />
                          <span>{item.title}</span>
                          {item.badge && (
                            <Badge
                              variant={item.badgeVariant || "secondary"}
                              className="ml-auto text-[10px] px-1.5 py-0 h-4 min-w-4"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
