import { SectionCards } from "@/components/section-cards"
import { SectionHeader } from "@/components/section-header"
import { Activity } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  InventoryModuleHeader,
  InventoryOverview,
} from "@/components/inventory-overview"
import { InventoryTable } from "@/components/inventory-table"
import {
  ComplianceFrameworkHeader,
  ComplianceFrameworksModule,
} from "@/components/compliance-frameworks"
import { RiskOverviewHeader, RiskOverviewModule } from "@/components/risk-overview"
import { AdvisorHeader, AdvisorModule } from "@/components/advisor-module"
import { AuditTimelineHeader, AuditTimelineModule } from "@/components/audit-timeline"
import {
  IncidentsEnforcementHeader,
  IncidentsEnforcementModule,
} from "@/components/incidents-module"

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 py-4 md:py-6">
      {/* ─────────── POSTURE OVERVIEW (high-level KPIs) ─────────── */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          icon={Activity}
          title="Governance Posture"
          description="A live read on platform-wide health, risk, and enforcement."
          meta={
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5" />
              All systems operational
            </Badge>
          }
        />
        <SectionCards />
      </section>

      {/* ─────────── AI INVENTORY ─────────── */}
      <section className="flex flex-col gap-3">
        <InventoryModuleHeader />
        <InventoryOverview />
        <InventoryTable />
      </section>

      {/* ─────────── COMPLIANCE FRAMEWORKS ─────────── */}
      <section className="flex flex-col gap-3">
        <ComplianceFrameworkHeader />
        <ComplianceFrameworksModule />
      </section>

      {/* ─────────── RISK OVERVIEW ─────────── */}
      <section className="flex flex-col gap-3">
        <RiskOverviewHeader />
        <RiskOverviewModule />
      </section>

      {/* ─────────── AI ADVISOR ─────────── */}
      <section className="flex flex-col gap-3">
        <AdvisorHeader />
        <AdvisorModule />
      </section>

      {/* ─────────── AUDIT TRAIL & ACTIVITY ─────────── */}
      <section className="flex flex-col gap-3">
        <AuditTimelineHeader />
        <AuditTimelineModule />
      </section>

      {/* ─────────── INCIDENTS & ENFORCEMENT ─────────── */}
      <section className="flex flex-col gap-3 pb-2">
        <IncidentsEnforcementHeader />
        <IncidentsEnforcementModule />
      </section>
    </div>
  )
}
