import React from 'react';
import { cn } from '../utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

function Input({ label, error, icon, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--foreground)]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={cn(
            'h-12 w-full rounded-xl border border-[var(--border)] bg-transparent px-4 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50',
            'focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200',
            icon && 'pl-11',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export { Input };
export type { InputProps };
