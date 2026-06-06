import React from 'react'
import { cn } from '../lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export default function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center mb-5 text-[var(--muted-foreground)]/50">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--muted-foreground)] max-w-md mb-6 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  )
}
