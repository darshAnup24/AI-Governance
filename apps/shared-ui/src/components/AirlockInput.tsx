import React from 'react';
import { cn } from '../lib/utils';

interface AirlockInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export default function AirlockInput({ label, error, icon, className, ...props }: AirlockInputProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]/80 font-mono">{label}</label>}
      <div className="relative">
        {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">{icon}</div>}
        <input
          className={cn(
            'w-full h-12 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)]/50 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
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

