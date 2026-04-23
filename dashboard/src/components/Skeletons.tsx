import React from 'react'

// ─── Skeleton Loader Components ──────────────────────────────────────────────

export function SkeletonBlock({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />
}


export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="h-8 w-1/2" />
      <SkeletonBlock className="h-4 w-full" />
      <SkeletonBlock className="h-4 w-4/5" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 flex-1" />
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-6 w-14 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ height = 280 }: { height?: number }) {
  return (
    <div className="card">
      <SkeletonBlock className="h-4 w-40 mb-6" />
      <div className="flex items-end gap-1" style={{ height }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <SkeletonBlock
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${20 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export function SkeletonKPIGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-8 w-16" />
        </div>
      ))}
    </div>
  )
}
