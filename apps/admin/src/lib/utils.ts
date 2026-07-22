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
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    AVAILABLE: 'bg-emerald-500/20 text-emerald-400',
    RESERVED: 'bg-amber-500/20 text-amber-400',
    ALLOCATED: 'bg-blue-500/20 text-blue-400',
    DELIVERED: 'bg-purple-500/20 text-purple-400',
    VOID: 'bg-red-500/20 text-red-400',
    EXPIRED: 'bg-gray-500/20 text-gray-400',
    PENDING: 'bg-amber-500/20 text-amber-400',
    FAILED: 'bg-red-500/20 text-red-400',
    REVERSED: 'bg-orange-500/20 text-orange-400',
    ACTIVE: 'bg-emerald-500/20 text-emerald-400',
    SUSPENDED: 'bg-amber-500/20 text-amber-400',
    DISABLED: 'bg-red-500/20 text-red-400',
    SUPER_ADMIN: 'bg-purple-500/20 text-purple-400',
    INVENTORY_MANAGER: 'bg-blue-500/20 text-blue-400',
    SUPPORT: 'bg-emerald-500/20 text-emerald-400',
    FINANCE: 'bg-amber-500/20 text-amber-400',
  };
  return colors[status] || 'bg-gray-500/20 text-gray-400';
}
