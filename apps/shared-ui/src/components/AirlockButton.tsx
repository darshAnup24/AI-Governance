import React from 'react';
import { cn } from '../lib/utils';

interface AirlockButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export default function AirlockButton({
  children, variant = 'primary', size = 'md', loading, icon, className, disabled, ...props
}: AirlockButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        
        variant === 'primary' && 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white shadow-sm hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(0,82,255,0.25)] hover:brightness-110',
        
        variant === 'secondary' && 'bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--muted)]/80 hover:border-[var(--accent)]/30 hover:-translate-y-0.5',
        
        variant === 'danger' && 'bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-500/20',
        
        variant === 'ghost' && 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-transparent hover:bg-[var(--muted)]',
        
        variant === 'outline' && 'border border-[var(--border)] text-[var(--foreground)] bg-[var(--card)] hover:bg-[var(--muted)] hover:-translate-y-0.5 hover:shadow-sm',
        
        size === 'sm' && 'h-9 px-3 text-xs rounded-lg',
        size === 'md' && 'h-12 px-5 text-sm rounded-xl',
        size === 'lg' && 'h-14 px-8 text-base rounded-xl',
        className
      )}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="group-hover:translate-x-0.5 transition-transform duration-200">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

