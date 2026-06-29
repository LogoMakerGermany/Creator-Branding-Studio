import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
}

export function PageHeader({ title, description, badge, actions, backTo, backLabel }: PageHeaderProps) {
  return (
    <div className="mb-8 space-y-4">
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-[var(--ucbs-accent-cyan)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel ?? 'Zurück'}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-2 max-w-2xl text-zinc-400">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
