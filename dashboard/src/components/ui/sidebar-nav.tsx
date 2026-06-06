import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { twMerge } from 'tailwind-merge'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export function SidebarNav({ sections, title }: { sections: NavSection[]; title?: string }) {
  return (
    <div className="space-y-4">
      {title ? (
        <div className="px-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{title}</p>
        </div>
      ) : null}
      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <div className="px-2 pb-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                {section.title}
              </p>
            </div>
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  twMerge(
                    'group flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)]'
                      : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={twMerge('h-4 w-4 shrink-0', isActive ? 'text-current' : 'text-[var(--muted-foreground)] group-hover:text-current')} />
                    <span className="truncate font-medium">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
