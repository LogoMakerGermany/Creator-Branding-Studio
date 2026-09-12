import { NexterPanel } from '@/components/nexter';
import { NexterOrb } from '@/components/nexter/NexterOrb';
import { useNexterStore } from '@/v2/store/nexter-store';
import { nexterOrbStatusLabel, resolveNexterOrbState } from '@ucbs/shared';

export function NexterPage() {
  const orbState = useNexterStore((s) => s.orbState);
  const audioLevel = useNexterStore((s) => s.audioLevel);
  const resolved = resolveNexterOrbState(orbState);
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-8rem)] w-full max-w-6xl overflow-x-hidden gap-3 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-8">
      <div className="flex flex-col items-center overflow-visible px-3 pt-1 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-black/30 sm:p-6">
        <div className="nexter-orb-stage h-[4.75rem] w-[4.75rem] sm:h-36 sm:w-36 lg:h-64 lg:w-64">
          <NexterOrb state={resolved} audioLevel={audioLevel} responsive />
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500" aria-live="polite">
          {nexterOrbStatusLabel(resolved)}
        </p>
        <h1 className="mt-2 hidden font-display text-2xl font-bold text-white sm:block">NEXTER</h1>
        <p className="mt-1 hidden text-center text-sm text-zinc-400 sm:block">
          Dein KI-Creator-Betriebssystem. Chat, Beratung, Aktionen.
        </p>
      </div>
      <div className="flex min-h-[min(70vh,720px)] h-[calc(100dvh-9rem)] max-h-[calc(100dvh-7rem)] flex-col sm:h-auto sm:min-h-[min(70vh,720px)] sm:max-h-none">
        <NexterPanel className="h-full min-h-0" />
      </div>
    </div>
  );
}
