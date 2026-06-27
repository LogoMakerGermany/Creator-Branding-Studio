import { Link } from 'react-router-dom';
import type { ModuleDefinition } from '@ucbs/shared';
import { INFOGRAPHIC_MODULE_NUMBERS } from '@ucbs/shared';
import { getModuleIcon } from '@/config/navigation';
import { cn } from '@/lib/utils';

type Accent = 'purple' | 'cyan' | 'magenta';

interface ModuleHubCardProps {
  module: ModuleDefinition;
  accent?: Accent;
  compact?: boolean;
}

const accentClass: Record<Accent, string> = {
  purple: '',
  cyan: 'ucbs-neon-card-cyan',
  magenta: 'ucbs-neon-card-magenta',
};

export function ModuleHubCard({ module, accent = 'purple', compact = false }: ModuleHubCardProps) {
  const Icon = getModuleIcon(module.icon);
  const num = INFOGRAPHIC_MODULE_NUMBERS[module.id];

  return (
    <Link
      to={module.path}
      className={cn('ucbs-neon-card group block p-4', accentClass[accent])}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/20 text-brand-300 ring-1 ring-brand-500/30 group-hover:bg-brand-500/30 group-hover:text-cyan-300">
          <Icon className="h-5 w-5" />
        </div>
        {num != null && (
          <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
            {num}
          </span>
        )}
      </div>
      <h3 className={cn('mt-3 font-display font-semibold text-zinc-100', compact && 'text-sm')}>
        {module.name}
      </h3>
      {!compact && (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500 group-hover:text-zinc-400">
          {module.description}
        </p>
      )}
      <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-brand-400/80">
        Phase {module.phase}
      </p>
    </Link>
  );
}
