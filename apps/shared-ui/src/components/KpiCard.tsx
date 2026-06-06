import { cn } from '../lib/utils';

interface KpiCardProps {
  label: string;
  value: string | number;
  change?: { value: number; label: string };
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const variantBorders = {
  default: 'border-[var(--border)] shadow-[0_4px_14px_rgba(0,82,255,0.02)]',
  success: 'border-green-500/20 shadow-[0_4px_14px_rgba(34,197,94,0.03)]',
  warning: 'border-yellow-500/20 shadow-[0_4px_14px_rgba(234,179,8,0.03)]',
  danger: 'border-red-500/20 shadow-[0_4px_14px_rgba(239,68,68,0.03)]',
};

const variantIconStyles = {
  default: 'bg-[var(--accent)]/5 text-[var(--accent)] border border-[var(--accent)]/10',
  success: 'bg-green-500/5 text-green-600 border border-green-500/10',
  warning: 'bg-yellow-500/5 text-yellow-600 border border-yellow-500/10',
  danger: 'bg-red-500/5 text-red-600 border border-red-500/10',
};

export default function KpiCard({ label, value, change, icon, variant = 'default', className }: KpiCardProps) {
  return (
    <div className={cn(
      'rounded-2xl border bg-[var(--card)] p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5',
      variantBorders[variant],
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.12em] font-mono">{label}</p>
          <p className="text-3xl font-semibold text-[var(--foreground)] tracking-tight font-sans">{value}</p>
          {change && (
            <p className={cn(
              'text-xs font-medium flex items-center gap-1 mt-1',
              change.value >= 0 ? 'text-green-600' : 'text-red-500'
            )}>
              <span className="text-sm">{change.value >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(change.value)}%</span>
              <span className="text-[var(--muted-foreground)] font-normal">{change.label}</span>
            </p>
          )}
        </div>
        {icon && (
          <div className={cn(
            'p-3 rounded-xl transition-transform duration-300 hover:scale-105',
            variantIconStyles[variant]
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

