import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface WorkflowStep {
  id: string;
  label: string;
  done?: boolean;
  active?: boolean;
}

export function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              step.active && 'border-[var(--ucbs-accent-cyan)]/50 bg-[var(--ucbs-accent-cyan)]/10 text-[var(--ucbs-accent-cyan)]',
              step.done && !step.active && 'border-[var(--ucbs-accent-green)]/40 text-[var(--ucbs-accent-green)]',
              !step.done && !step.active && 'border-white/10 text-zinc-500'
            )}
          >
            {step.done && <Check className="h-3 w-3" />}
            {step.label}
          </div>
          {i < steps.length - 1 && <span className="text-zinc-600">→</span>}
        </div>
      ))}
    </div>
  );
}
