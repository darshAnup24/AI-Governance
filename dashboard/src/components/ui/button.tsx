import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
        secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[color:color-mix(in_srgb,var(--secondary),black_8%)]',
        ghost: 'hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
        outline: 'border border-[var(--input)] bg-[var(--background)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        lg: 'h-11 px-8',
        sm: 'h-9 px-3',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, icon, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={twMerge(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {icon && !loading ? <span>{icon}</span> : null}
      <span>{children}</span>
      {!loading && icon && size === 'icon' ? (
        <span className="sr-only">{typeof children === 'string' ? children : 'button'}</span>
      ) : null}
    </button>
  ),
)

Button.displayName = 'Button'
