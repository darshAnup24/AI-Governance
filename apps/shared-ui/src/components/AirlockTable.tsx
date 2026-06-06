import React from 'react';
import { cn } from '../lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (value: any, row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

interface AirlockTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  className?: string;
  emptyMessage?: string;
}

export default function AirlockTable<T extends { id: string }>({
  columns, data, onRowClick, className, emptyMessage = 'No data'
}: AirlockTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--muted-foreground)]/60 text-sm">{emptyMessage}</div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-5 py-3.5 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider font-mono', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {data.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'hover:bg-[var(--muted)]/50 transition-colors duration-200',
                onRowClick && 'cursor-pointer'
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-5 py-4 text-[var(--foreground)]', col.className)}>
                  {col.render ? col.render(row[col.key as keyof T], row) : String(row[col.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

