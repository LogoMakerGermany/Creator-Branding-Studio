import type { ReactNode } from 'react';
import { GlassCard } from './GlassCard';

interface StudioWorkbenchProps {
  settings: ReactNode;
  preview: ReactNode;
  actions?: ReactNode;
  history?: ReactNode;
  settingsTitle?: string;
  previewTitle?: string;
}

/** V2 studio layout: Eigenschaften links, Live-Vorschau rechts */
export function StudioWorkbench({
  settings,
  preview,
  actions,
  history,
  settingsTitle = 'Eigenschaften',
  previewTitle = 'Live-Vorschau',
}: StudioWorkbenchProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <GlassCard accent="cyan" className="!p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-[var(--ucbs-accent-cyan)]">
            {settingsTitle}
          </h2>
          {settings}
        </GlassCard>

        <GlassCard accent="purple" className="!p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
            {previewTitle}
          </h2>
          {preview}
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </GlassCard>
      </div>
      {history}
    </div>
  );
}
