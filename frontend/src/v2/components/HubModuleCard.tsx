import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface HubModuleCardProps {
  title: string;
  description: string;
  path: string;
  accent: 'cyan' | 'purple' | 'green';
}

export function HubModuleCard({ title, description, path, accent }: HubModuleCardProps) {
  return (
    <Link to={path} className="block h-full">
      <GlassCard accent={accent} className="group flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ucbs-accent-cyan)]" />
        </div>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{description}</p>
      </GlassCard>
    </Link>
  );
}
