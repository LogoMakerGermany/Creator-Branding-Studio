import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatCoins } from '@/lib/utils';

interface StudioShellProps {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  coinCost?: number;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function StudioShell({
  title,
  description,
  backTo = '/branding-studio',
  backLabel = 'Branding Studio',
  coinCost,
  badge,
  actions,
  children,
}: StudioShellProps) {
  return (
    <div className="space-y-6">
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-[var(--ucbs-accent-cyan)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{title}</h1>
            {badge ?? <Badge variant="brand">KI-generiert</Badge>}
          </div>
          {description && <p className="mt-2 max-w-2xl text-zinc-400">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {coinCost != null && (
            <Badge variant="default">{formatCoins(coinCost)} Coins</Badge>
          )}
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}
