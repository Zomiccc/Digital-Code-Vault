import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    ALLOCATED: 'bg-blue-100 text-blue-700',
    DELIVERED: 'bg-purple-100 text-purple-700',
    FAILED: 'bg-red-100 text-red-700',
    REVERSED: 'bg-orange-100 text-orange-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    SUSPENDED: 'bg-amber-100 text-amber-700',
    DISABLED: 'bg-red-100 text-red-700',
    AVAILABLE: 'bg-emerald-100 text-emerald-700',
    VOID: 'bg-red-100 text-red-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}
