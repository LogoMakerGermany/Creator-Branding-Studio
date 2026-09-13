import { NexterPanel } from '@/components/nexter';
import { NexterOrb } from '@/components/nexter/NexterOrb';
import { useNexterStore } from '@/v2/store/nexter-store';
import { nexterOrbStatusLabel, resolveNexterOrbState } from '@ucbs/shared';

export function NexterPage() {
  const orbState = useNexterStore((s) => s.orbState);
  const audioLevel = useNexterStore((s) => s.audioLevel);
  const resolved = resolveNexterOrbState(orbState);
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-8rem)] w-full max-w-6xl overflow-x-hidden gap-2 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="nexter-hero flex flex-col items-center overflow-visible px-2 pt-0 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-black/30 sm:px-4 sm:pb-4 sm:pt-3">
        <div className="nexter-orb-stage h-[9.5rem] w-[9.5rem] sm:h-[12.25rem] sm:w-[12.25rem] lg:h-[20.625rem] lg:w-[20.625rem]">
          <NexterOrb state={resolved} audioLevel={audioLevel} responsive />
        </div>
        <p className="nexter-orb-status" aria-live="polite">
          {nexterOrbStatusLabel(resolved)}
        </p>
        <h1 className="mt-1 hidden font-display text-xl font-bold tracking-[0.18em] text-white sm:block">NEXTER</h1>
        <p className="mt-0.5 hidden max-w-[16rem] text-center text-[11px] leading-snug text-zinc-500 sm:block">
          Dein KI-Creator-Betriebssystem. Chat, Beratung, Aktionen.
        </p>
      </div>
      <div className="flex min-h-[min(70vh,720px)] h-[calc(100dvh-8.5rem)] max-h-[calc(100dvh-6.5rem)] flex-col sm:h-auto sm:min-h-[min(70vh,720px)] sm:max-h-none">
        <NexterPanel className="h-full min-h-0" />
      </div>
    </div>
  );
}
