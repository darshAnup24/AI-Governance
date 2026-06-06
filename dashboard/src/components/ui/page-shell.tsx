import type { ReactNode } from 'react'

type Tone = 'default' | 'live' | 'warning' | 'danger'

const toneClasses: Record<Tone, string> = {
  default: 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]',
  live: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>
}

export function PageHeader({
  badge,
  title,
  description,
  actions,
  status,
}: {
  badge?: string
  title: string
  description?: string
  actions?: ReactNode
  status?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        {badge ? (
          <div className="section-badge">
            <span className="h-2 w-2 rounded-full bg-[var(--muted-foreground)]" />
            <span className="section-badge-label">{badge}</span>
          </div>
        ) : null}
        <h1 className="mt-3 text-3xl font-semibold leading-none tracking-tight text-[var(--foreground)] md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>

      {(status || actions) ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {status}
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function StatusPill({
  label,
  tone = 'default',
  pulse = false,
}: {
  label: string
  tone?: Tone
  pulse?: boolean
}) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      <span
        aria-hidden="true"
        className={`${pulse ? 'opacity-90' : ''} h-2 w-2 rounded-full ${
          tone === 'live'
            ? 'bg-emerald-500'
            : tone === 'warning'
              ? 'bg-amber-500'
              : tone === 'danger'
                ? 'bg-red-500'
                : 'bg-[var(--foreground)]'
        }`}
      />
      <span>{label}</span>
    </div>
  )
}

export function SurfaceSection({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}
