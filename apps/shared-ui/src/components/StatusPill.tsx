import { cn } from '../lib/utils';

interface StatusPillProps {
  status: string;
  className?: string;
  pulsing?: boolean;
}

const statusColors: Record<string, string> = {
  healthy: 'bg-green-500/5 text-green-600 border-green-500/20',
  degraded: 'bg-yellow-500/5 text-yellow-600 border-yellow-500/20',
  down: 'bg-red-500/5 text-red-600 border-red-500/20',
  active: 'bg-green-500/5 text-green-600 border-green-500/20',
  inactive: 'bg-gray-500/5 text-gray-500 border-gray-500/20',
  pending: 'bg-yellow-500/5 text-yellow-600 border-yellow-500/20',
  blocked: 'bg-red-500/5 text-red-600 border-red-500/20',
  allowed: 'bg-green-500/5 text-green-600 border-green-500/20',
  compliant: 'bg-green-500/5 text-green-600 border-green-500/20',
  non_compliant: 'bg-red-500/5 text-red-600 border-red-500/20',
  partial: 'bg-yellow-500/5 text-yellow-600 border-yellow-500/20',
  open: 'bg-red-500/5 text-red-600 border-red-500/20',
  acknowledged: 'bg-yellow-500/5 text-yellow-600 border-yellow-500/20',
  investigating: 'bg-blue-500/5 text-blue-600 border-blue-500/20',
  contained: 'bg-purple-500/5 text-purple-600 border-purple-500/20',
  resolved_closed: 'bg-green-500/5 text-green-600 border-green-500/20',
  false_positive: 'bg-gray-500/5 text-gray-500 border-gray-500/20',
};

export default function StatusPill({ status, className, pulsing }: StatusPillProps) {
  const color = statusColors[status.toLowerCase()] || 'bg-gray-500/5 text-gray-500 border-gray-500/20';
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
      color,
      className
    )}>
      {pulsing ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      )}
      {status}
    </span>
  );
}
