import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../utils';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  pulsing?: boolean;
}

function SectionLabel({ children, className, pulsing = true }: SectionLabelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'inline-flex items-center gap-3 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-5 py-2',
        className
      )}
    >
      {pulsing ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
        </span>
      ) : (
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
      )}
      <span
        style={{ fontFamily: 'var(--font-mono)' }}
        className="text-xs uppercase tracking-[0.15em] text-[var(--accent)]"
      >
        {children}
      </span>
    </motion.div>
  );
}

export { SectionLabel };
export type { SectionLabelProps };
