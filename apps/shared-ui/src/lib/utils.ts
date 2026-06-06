import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function formatPercent(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function severityColor(s: string): string {
  switch (s.toUpperCase()) {
    case 'CRITICAL': return 'text-red-400 bg-red-400/10';
    case 'HIGH': return 'text-orange-400 bg-orange-400/10';
    case 'MEDIUM': return 'text-yellow-400 bg-yellow-400/10';
    case 'LOW': return 'text-green-400 bg-green-400/10';
    default: return 'text-gray-400 bg-gray-400/10';
  }
}

export function riskColor(score: number): string {
  if (score >= 80) return 'text-red-400';
  if (score >= 50) return 'text-orange-400';
  if (score >= 20) return 'text-yellow-400';
  return 'text-green-400';
}

export function riskBgColor(score: number): string {
  if (score >= 80) return 'bg-red-400';
  if (score >= 50) return 'bg-orange-400';
  if (score >= 20) return 'bg-yellow-400';
  return 'bg-green-400';
}
