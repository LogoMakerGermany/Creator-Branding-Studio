import { ArrowRight, Image, Smile, Box } from 'lucide-react';

const steps = [
  { icon: Image, label: 'DNA', desc: 'Creator Branding' },
  { icon: Smile, label: 'Charakter', desc: 'KI-Design PNG' },
  { icon: Box, label: 'Emotes', desc: 'Avatar & Expressions' },
];

export function VtuberPipeline() {
  return (
    <div className="ucbs-neon-card ucbs-neon-card-cyan mb-6 flex flex-wrap items-center justify-center gap-2 p-4">
      {steps.map(({ icon: Icon, label, desc }, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1 px-3 py-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/20 ring-1 ring-brand-500/40">
              <Icon className="h-5 w-5 text-cyan-300" />
            </div>
            <span className="text-xs font-semibold text-zinc-200">{label}</span>
            <span className="text-[10px] text-zinc-500">{desc}</span>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="h-4 w-4 text-brand-500/50" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
