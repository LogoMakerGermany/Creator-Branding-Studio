import { NexterPanel } from '@/components/nexter';
import { NexterOrb } from '@/components/nexter/NexterOrb';
import { useNexterStore } from '@/v2/store/nexter-store';

export function NexterPage() {
  const orbState = useNexterStore((s) => s.orbState);
  const audioLevel = useNexterStore((s) => s.audioLevel);
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-black/30 p-6">
        <NexterOrb state={orbState} size={160} audioLevel={audioLevel} />
        <h1 className="mt-4 font-display text-2xl font-bold text-white">NEXTER</h1>
        <p className="mt-1 text-center text-sm text-zinc-400">Dein KI-Creator-Betriebssystem. Chat, Beratung, Aktionen.</p>
      </div>
      <div className="h-[min(70vh,720px)]">
        <NexterPanel className="h-full" />
      </div>
    </div>
  );
}
