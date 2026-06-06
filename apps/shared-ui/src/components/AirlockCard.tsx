import React from 'react';
import { cn } from '../lib/utils';

interface AirlockCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  variant?: 'default' | 'glass' | 'bordered';
}

export default function AirlockCard({
  children, className, title, subtitle, icon, action, variant = 'default'
}: AirlockCardProps) {
  return (
    <div className={cn(
      'rounded-2xl border transition-all duration-300 ease-out bg-[var(--card)] border-[var(--border)] shadow-sm hover:shadow-md',
      variant === 'glass' && 'bg-[var(--card)]/80 backdrop-blur-xl border-[var(--border)]/50',
      variant === 'bordered' && 'border-[var(--accent)]/30 shadow-[0_4px_14px_rgba(0,82,255,0.06)]',
      className
    )}>
      {(title || icon || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            {icon && <span className="text-[var(--muted-foreground)]">{icon}</span>}
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-[var(--foreground)] tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

