import { useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import { useGovernanceDemoStream } from '../lib/live'

function severityClasses(level: string) {
  if (level === 'CRITICAL') return 'bg-red-500 text-white'
  if (level === 'HIGH') return 'bg-orange-500 text-white'
  if (level === 'MEDIUM') return 'bg-yellow-400 text-slate-950'
  if (level === 'LOW') return 'bg-emerald-500 text-white'
  return 'bg-sky-500 text-white'
}

export default function AdvisorLivePage() {
  const { events, status } = useGovernanceDemoStream(20)
  const latestIncident = useMemo(
    () => events.find((event) => event.incidentId && event.advisor?.summary) || events[0],
    [events],
  )
  const [visibleId, setVisibleId] = useState<string | null>(null)

  useEffect(() => {
    if (latestIncident?.id) {
      setVisibleId(latestIncident.id)
    }
  }, [latestIncident?.id])

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-8 py-8">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Airlock Advisor Live</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Real-time AI incident analysis</h1>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <span className="text-sm font-medium text-emerald-200">LIVE</span>
            <span className="text-xs text-cyan-100/70">{status}</span>
          </div>
        </div>

        {!latestIncident ? (
          <div className="flex flex-1 items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.03]">
            <div className="text-center">
              <Activity className="mx-auto h-12 w-12 text-cyan-300/70" />
              <p className="mt-4 text-2xl font-medium">Waiting for the next incident</p>
              <p className="mt-2 text-base text-slate-300">The newest advisor summary will appear here automatically.</p>
            </div>
          </div>
        ) : (
          <div
            key={visibleId}
            className="animate-advisor-fade flex flex-1 flex-col rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(15,23,42,0.92),rgba(8,15,29,0.98))] p-10 shadow-[0_30px_100px_rgba(0,0,0,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/70">{new Date(latestIncident.timestamp).toLocaleTimeString()}</p>
                <h2 className="mt-2 text-4xl font-semibold leading-tight">{latestIncident.title || 'Governance incident detected'}</h2>
              </div>
              <span className={`rounded-full px-5 py-2 text-lg font-semibold ${severityClasses(latestIncident.severity)}`}>
                {latestIncident.severity}
              </span>
            </div>

            <div className="mt-10 text-[24px] leading-[1.45] text-slate-100">
              {latestIncident.advisor?.summary || 'Advisor summary is not available yet.'}
            </div>

            <div className="mt-10">
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/70">Remediation</p>
              <ol className="mt-4 space-y-4 text-[22px] leading-[1.45] text-slate-100">
                {(latestIncident.advisor?.remediation || []).map((step, index) => (
                  <li key={`${latestIncident.id}-${index}`} className="flex gap-4">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-base font-semibold text-cyan-200">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-auto rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-6">
              <p className="text-sm uppercase tracking-[0.2em] text-amber-100/80">Compliance impact</p>
              <p className="mt-3 text-[20px] leading-[1.5] text-amber-50">
                {latestIncident.advisor?.compliance_impact || 'Compliance impact will appear once the advisor response completes.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
