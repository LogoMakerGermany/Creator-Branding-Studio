import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ModulePlaceholderProps {
  title: string;
  description: string;
  phase: number;
  features?: string[];
  icon?: ReactNode;
}

export function ModulePlaceholder({
  title,
  description,
  phase,
  features = [],
  icon,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-zinc-700 bg-surface-900/30 p-8 text-center">
        {icon && (
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
            {icon}
          </div>
        )}
        <h2 className="font-display text-xl font-semibold text-zinc-200">{title}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-400">{description}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-brand-400">
          Phase {phase} – In Entwicklung
        </p>
      </div>

      {features.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature}
              className="rounded-lg border border-zinc-800 bg-surface-900/50 p-4 text-sm text-zinc-300"
            >
              {feature}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
  className?: string;
}

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-zinc-800 bg-surface-900/50 p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold text-zinc-100">{value}</p>
          {trend && <p className="mt-1 text-xs text-emerald-400">{trend}</p>}
        </div>
        {icon && <div className="text-brand-400">{icon}</div>}
      </div>
    </div>
  );
}
