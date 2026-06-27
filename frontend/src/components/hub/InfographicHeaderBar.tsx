import { Brain, Layers, Clock, Shield, Zap } from 'lucide-react';

const pills = [
  { icon: Brain, label: 'KI-Powered' },
  { icon: Layers, label: 'All-in-One' },
  { icon: Clock, label: 'Zeit sparen' },
  { icon: Zap, label: 'Flexibel' },
  { icon: Shield, label: 'Sicher' },
];

export function InfographicHeaderBar() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-4">
      {pills.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-200"
        >
          <Icon className="h-3.5 w-3.5 text-cyan-400" />
          {label}
        </div>
      ))}
    </div>
  );
}
