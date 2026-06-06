import React from 'react';
import { cva, cn, type VariantProps } from '../utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors duration-200',
  {
    variants: {
      variant: {
        default: 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]',
        accent: 'border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)]',
        success: 'border-green-500/30 bg-green-500/5 text-green-600',
        warning: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-600',
        danger: 'border-red-500/30 bg-red-500/5 text-red-600',
        info: 'border-blue-500/30 bg-blue-500/5 text-blue-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  pulsing?: boolean;
}

function Badge({ children, variant, pulsing, className, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {pulsing && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
        </span>
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
export type { BadgeProps };
