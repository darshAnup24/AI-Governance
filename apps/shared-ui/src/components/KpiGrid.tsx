import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { fadeInUp, stagger } from '../design-system/animations';

interface KpiGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

const gridCols = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export default function KpiGrid({ children, columns = 4, className }: KpiGridProps) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className={cn('grid gap-5', gridCols[columns], className)}
    >
      {Array.isArray(children)
        ? children.map((child, i) => (
            <motion.div key={i} variants={fadeInUp}>
              {child}
            </motion.div>
          ))
        : children}
    </motion.div>
  );
}
