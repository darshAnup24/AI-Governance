import * as React from 'react'
import { twMerge } from 'tailwind-merge'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? props.name

    return (
      <label className="block space-y-2" htmlFor={inputId}>
        {label ? (
          <span className="block text-sm font-medium text-[var(--foreground)]">{label}</span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={twMerge(
            'flex h-10 w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] ring-offset-[var(--background)] placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2',
            error ? 'border-red-500 focus-visible:ring-red-500' : '',
            className,
          )}
          {...props}
        />
        {error ? <span className="text-xs text-red-500">{error}</span> : null}
        {!error && hint ? <span className="text-xs text-[var(--muted-foreground)]">{hint}</span> : null}
      </label>
    )
  },
)

Input.displayName = 'Input'
