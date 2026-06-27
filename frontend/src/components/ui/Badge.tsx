import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-zinc-800 text-zinc-300',
  brand: 'bg-brand-500/20 text-brand-300 border border-brand-500/30',
  success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  danger: 'bg-red-500/20 text-red-300 border border-red-500/30',
  phase: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
};

interface BadgeProps {
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
