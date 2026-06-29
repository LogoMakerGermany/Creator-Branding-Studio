import type { ReactNode } from 'react';
import { HubModuleCard } from '@/v2/components/HubModuleCard';
import type { HubModule } from '@/v2/config/navigation';

interface HubPageLayoutProps {
  title: string;
  description: string;
  children?: ReactNode;
  modules: HubModule[];
}

export function HubPageLayout({ title, description, children, modules }: HubPageLayoutProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">{description}</p>
      </div>
      {children}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((mod) => (
          <HubModuleCard key={mod.id} {...mod} />
        ))}
      </div>
    </div>
  );
}
