import { cn } from '../lib/utils';

interface AirlockBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  pulsing?: boolean;
}

const variantStyles = {
  default: 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]',
  success: 'border-green-500/20 bg-green-500/5 text-green-600',
  warning: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-600',
  danger: 'border-red-500/20 bg-red-500/5 text-red-600',
  info: 'border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)]',
};

export default function AirlockBadge({ children, variant = 'default', className, pulsing }: AirlockBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors duration-200',
      variantStyles[variant],
      className
    )}>
      {pulsing && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

