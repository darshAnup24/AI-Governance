import React from 'react';
import { cn } from '../lib/utils';

interface AirlockSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export default function AirlockSelect({ label, options, className, ...props }: AirlockSelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]/80 font-mono">{label}</label>}
      <select
        className={cn(
          'w-full h-12 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm text-[var(--foreground)] transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)]',
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[var(--card)] text-[var(--foreground)]">{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

