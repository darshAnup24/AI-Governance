import React from 'react';
import { cva, cn, type VariantProps } from '../utils';

const cardVariants = cva(
  'rounded-xl border bg-[var(--card)] transition-all duration-300 ease-out',
  {
    variants: {
      variant: {
        default: 'border-[var(--border)] shadow-sm',
        elevated: 'border-[var(--border)] shadow-md hover:shadow-xl hover:-translate-y-0.5',
        glass: 'border-[var(--border)]/50 bg-[var(--card)]/80 backdrop-blur-xl',
        featured:
          'shadow-[0_4px_14px_rgba(0,82,255,0.15)] hover:shadow-[0_8px_24px_rgba(0,82,255,0.25)]',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
        xl: 'p-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  }
);

interface CardProps
  extends VariantProps<typeof cardVariants> {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

function Card({
  children,
  variant,
  padding,
  className,
  title,
  subtitle,
  icon,
  action,
}: CardProps) {
  return (
    <div className={cn(cardVariants({ variant, padding }), className)}>
      {(title || icon || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            {icon && <span className="text-[var(--muted-foreground)]">{icon}</span>}
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-[var(--muted-foreground)]">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn(!title && !icon && !action && padding ? `p-${padding}` : 'p-6')}>
        {children}
      </div>
    </div>
  );
}

export { Card, cardVariants };
export type { CardProps };
