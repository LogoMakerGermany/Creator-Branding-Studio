import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StudioOptionPill({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-lg border px-2 py-1 text-xs transition-colors',
        active
          ? 'border-[var(--ucbs-accent-cyan)]/50 bg-[var(--ucbs-accent-cyan)]/10 text-[var(--ucbs-accent-cyan)]'
          : 'border-white/10 text-zinc-400 hover:border-white/20',
        className
      )}
    >
      {children}
    </button>
  );
}
