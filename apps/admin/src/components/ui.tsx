import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className, hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border border-border bg-card p-6 shadow-sm transition-all duration-200',
        hover && 'hover:border-primary/20 hover:shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label, value, icon: Icon, color = 'text-primary', trend,
}: { label: string; value: string | number; icon: any; color?: string; trend?: string }) {
  return (
    <Card className="group relative overflow-hidden">
      <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
        <Icon className={cn('h-16 w-16', color)} />
      </div>
      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        {trend && <p className="mt-1 text-xs text-emerald-400">{trend}</p>}
      </div>
    </Card>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children, onClick, variant = 'primary', className, type = 'button', disabled, size = 'md', title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const variants = {
    primary:
      'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.4)]',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost: 'hover:bg-muted text-foreground',
    outline: 'border border-border bg-transparent hover:bg-muted hover:border-primary/30',
  };
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input({
  label, type = 'text', value, onChange, placeholder, required, leftIcon,
}: {
  label?: string;
  type?: string;
  value?: string;
  onChange?: (e: any) => void;
  placeholder?: string;
  required?: boolean;
  leftIcon?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {leftIcon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className={cn(
            'w-full rounded-lg border border-input bg-background py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30',
            leftIcon ? 'pl-10' : 'px-3',
            'pr-3',
          )}
        />
      </div>
    </div>
  );
}

export function Select({
  label, value, onChange, options,
}: {
  label?: string;
  value?: string;
  onChange?: (e: any) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>}
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 pr-8 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-1 focus:ring-primary/30"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('px-4 py-3.5 border-t border-border transition-colors', className)}>
      {children}
    </td>
  );
}

export function Modal({
  open, onClose, title, children, size = 'md',
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full rounded-[var(--radius)] border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200',
          sizes[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
