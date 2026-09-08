import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Wird geladen"
      className={cn(
        'animate-pulse rounded-[18px] bg-[var(--ucbs-hover)]/60',
        className
      )}
    />
  );
}
