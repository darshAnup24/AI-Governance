import { useUserHeatmap, useUsers } from '../../lib/hooks'
import { SkeletonCard } from '../../components/Skeletons'
import { InlineError } from '../../components/ErrorBoundary'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function riskColor(score: number): string {
  if (score >= 80) return 'bg-red-500'
  if (score >= 60) return 'bg-orange-500'
  if (score >= 40) return 'bg-yellow-500'
  if (score >= 20) return 'bg-emerald-500'
  return 'bg-slate-700'
}

function riskOpacity(score: number): string {
  if (score >= 80) return 'opacity-100'
  if (score >= 60) return 'opacity-80'
  if (score >= 40) return 'opacity-60'
  if (score >= 20) return 'opacity-50'
  return 'opacity-30'
}

function riskLabel(score: number) {
  if (score >= 80) return { label: 'Critical', cls: 'text-red-400' }
  if (score >= 60) return { label: 'High', cls: 'text-orange-400' }
  if (score >= 40) return { label: 'Medium', cls: 'text-yellow-400' }
  return { label: 'Low', cls: 'text-emerald-400' }
}

function TrendIcon({ score }: { score: number }) {
  if (score >= 60) return <TrendingUp className="w-3.5 h-3.5 text-red-400" />
  if (score <= 30) return <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
  return <Minus className="w-3.5 h-3.5 text-slate-500" />
}

export default function UserHeatmapPage() {
  const heatmapQ = useUserHeatmap()
  const usersQ = useUsers()

  const heatmap = heatmapQ.data ?? []
  const users = usersQ.data ?? []

  const overallRisk = users.length
    ? Math.round(users.reduce((a: number, u: any) => a + (u.riskScore ?? 0), 0) / users.length)
    : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">User Behavior Heatmap</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Risk concentration per employee × day of week
        </p>
      </div>

      {(heatmapQ.isError || usersQ.isError) && (
        <InlineError message="Using demo heatmap data." onRetry={() => { heatmapQ.refetch(); usersQ.refetch() }} />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-red-500/5 border-red-500/20">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Org Avg Risk</p>
          <p className="text-2xl font-bold text-red-400">{overallRisk}</p>
        </div>
        <div className="card bg-orange-500/5 border-orange-500/20">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">High Risk Users</p>
          <p className="text-2xl font-bold text-orange-400">
            {users.filter((u: any) => u.riskScore >= 60).length}
          </p>
        </div>
        <div className="card bg-yellow-500/5 border-yellow-500/20">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Medium Risk</p>
          <p className="text-2xl font-bold text-yellow-400">
            {users.filter((u: any) => u.riskScore >= 40 && u.riskScore < 60).length}
          </p>
        </div>
        <div className="card bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Low Risk</p>
          <p className="text-2xl font-bold text-emerald-400">
            {users.filter((u: any) => u.riskScore < 40).length}
          </p>
        </div>
      </div>

      {heatmapQ.isPending ? (
        <SkeletonCard />
      ) : (
        <div className="card overflow-x-auto">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Risk by User × Day of Week</h2>

          {/* Day labels */}
          <div className="flex items-center mb-2">
            <div className="w-40 flex-shrink-0" />
            {DAYS.map(d => (
              <div key={d} className="flex-1 text-center text-[10px] text-slate-500 uppercase tracking-wider min-w-[40px]">
                {d}
              </div>
            ))}
            <div className="w-20 flex-shrink-0 text-[10px] text-slate-500 uppercase tracking-wider text-center">Avg</div>
          </div>

          {/* Heatmap rows */}
          <div className="space-y-1.5">
            {heatmap.map((row: any, i: number) => {
              const avg = Math.round(row.days.reduce((a: number, v: number) => a + v, 0) / row.days.length)
              const { label, cls } = riskLabel(avg)
              return (
                <div key={i} className="flex items-center gap-0">
                  {/* User label */}
                  <div className="w-40 flex-shrink-0 pr-3">
                    <p className="text-xs text-slate-300 truncate">{row.user}</p>
                  </div>

                  {/* Cells */}
                  {row.days.map((score: number, d: number) => (
                    <div key={d} className="flex-1 flex justify-center items-center min-w-[40px] py-0.5">
                      <div
                        title={`${row.user} — ${DAYS[d]}: ${score}`}
                        className={`w-9 h-9 rounded-lg cursor-default transition-transform hover:scale-110 flex items-center justify-center text-[10px] font-bold text-white/70 ${riskColor(score)} ${riskOpacity(score)}`}
                      >
                        {score}
                      </div>
                    </div>
                  ))}

                  {/* Row average */}
                  <div className="w-20 flex-shrink-0 text-center">
                    <span className={`text-xs font-semibold ${cls}`}>{avg}</span>
                    <span className={`text-[10px] block ${cls} opacity-60`}>{label}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-800">
            <span className="text-[10px] text-slate-600 uppercase">Risk scale:</span>
            {[
              { label: 'Low (0–20)', color: 'bg-slate-700' },
              { label: 'Low–Med (21–40)', color: 'bg-emerald-500 opacity-50' },
              { label: 'Medium (41–60)', color: 'bg-yellow-500' },
              { label: 'High (61–80)', color: 'bg-orange-500' },
              { label: 'Critical (81–100)', color: 'bg-red-500' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className={`w-3.5 h-3.5 rounded ${l.color}`} />
                <span className="text-[10px] text-slate-500">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User table */}
      {!usersQ.isPending && (
        <div className="card">
          <h2 className="text-base font-semibold text-slate-100 mb-4">User Risk Ranking</h2>
          <div className="space-y-2">
            {[...users].sort((a: any, b: any) => b.riskScore - a.riskScore).map((u: any) => {
              const { label, cls } = riskLabel(u.riskScore)
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.department} · {u.role}</p>
                  </div>
                  <div className="w-32 hidden sm:block">
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${riskColor(u.riskScore)}`}
                        style={{ width: `${u.riskScore}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${cls}`}>{u.riskScore}</p>
                    <div className="flex items-center justify-end gap-0.5">
                      <TrendIcon score={u.riskScore} />
                      <span className={`text-[10px] ${cls}`}>{label}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
