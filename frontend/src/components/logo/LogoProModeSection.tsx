import { GraduationCap, Settings2 } from 'lucide-react';
import {
  isLogoStudioProMode,
  type LogoStudioMode,
} from '@ucbs/shared';
import { GlassCard } from '@/v2/components/GlassCard';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';

type LogoProModeSectionProps = {
  mode: LogoStudioMode;
  onModeChange: (mode: LogoStudioMode) => void;
};

export function LogoProModeSection({ mode, onModeChange }: LogoProModeSectionProps) {
  const isPro = isLogoStudioProMode(mode);

  return (
    <GlassCard accent="purple" hover={false} className="space-y-3 !p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
          Schritt 14 · Profi-Modus
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Einsteiger-Modus zeigt nur das Wesentliche. Profi-Modus schaltet Beleuchtung, Kamera, KI, Live-Prompt und erweiterte MAGIK-Optionen frei.
        </p>
      </div>

      <div className="flex gap-2">
        <StudioOptionPill
          active={mode === 'beginner'}
          onClick={() => onModeChange('beginner')}
          className="flex-1 justify-center gap-1.5 text-[11px]"
        >
          <GraduationCap className="h-3.5 w-3.5" />
          Einsteiger
        </StudioOptionPill>
        <StudioOptionPill
          active={mode === 'pro'}
          onClick={() => onModeChange('pro')}
          className="flex-1 justify-center gap-1.5 text-[11px]"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Profi
        </StudioOptionPill>
      </div>

      {!isPro && (
        <p className="rounded-lg border border-[var(--ucbs-accent-purple)]/20 bg-[var(--ucbs-accent-purple)]/5 px-3 py-2 text-[10px] text-zinc-400">
          Tipp: Vorlagen und Favoriten funktionieren in beiden Modi. Für Feintuning wechsle zu Profi.
        </p>
      )}
    </GlassCard>
  );
}
