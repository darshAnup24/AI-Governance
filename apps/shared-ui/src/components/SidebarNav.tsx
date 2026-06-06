import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
}

interface SidebarNavProps {
  items: NavItem[];
  title: string;
}

export default function SidebarNav({ items, title }: SidebarNavProps) {
  return (
    <div className="mb-6">
      <h3 className="px-3 mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]/60 font-mono">
        {title}
      </h3>
      <nav className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/governance' || item.to === '/dashboard' || item.to === '/lab'}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border border-transparent',
              isActive
                ? 'bg-[var(--accent)] text-white shadow-sm shadow-[rgba(0,82,255,0.25)] border-[var(--accent)]/10 font-medium'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0 opacity-80" />
            <span className="truncate">{item.label}</span>
            {item.badge && <span className="ml-auto">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

