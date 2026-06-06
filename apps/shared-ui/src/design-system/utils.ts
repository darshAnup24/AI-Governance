import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export type { VariantProps } from 'class-variance-authority';
export { cva } from 'class-variance-authority';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
