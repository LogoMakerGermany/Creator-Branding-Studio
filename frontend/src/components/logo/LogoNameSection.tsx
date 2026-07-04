import { Sparkles, Shuffle, Wand2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';
import { LOGO_NAME_EXAMPLES, LOGO_SUBTITLE_PRESETS, type LogoGenerationOptions } from '@ucbs/shared';

type NameAnalysis = {
  summary: string;
  suggestedStyle: string;
  styleReason: string;
} | null;

type LogoNameSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
  nameAnalysis: NameAnalysis;
  nameError?: string;
  loading: boolean;
  disabled: boolean;
  coinCost: number;
  onGenerateFromName: () => void;
  onGenerateRandom: () => void;
};

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-medium text-zinc-400">
      {children}
      {required && <span className="text-[var(--ucbs-accent-cyan)]"> *</span>}
    </label>
  );
}

export function LogoNameSection({
  form,
  onFormChange,
  nameAnalysis,
  nameError,
  loading,
  disabled,
  coinCost,
  onGenerateFromName,
  onGenerateRandom,
}: LogoNameSectionProps) {
  const hasName = (form.logoName?.trim().length ?? 0) >= 2;

  return (
    <GlassCard accent="cyan" hover={false} className="space-y-4 !p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-cyan)]">
          Schritt 1 · Name & Generierung
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          MAGIK analysiert deinen Namen und entwickelt automatisch ein passendes Logo.
        </p>
      </div>

      <div>
        <FieldLabel required>Name des Logos</FieldLabel>
        <Input
          placeholder="Gib deinen Namen, Clan oder Teamnamen ein"
          value={form.logoName ?? ''}
          onChange={(e) => onFormChange({ logoName: e.target.value })}
          className="text-sm"
        />
        {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
        <p className="mt-2 text-[10px] text-zinc-600">
          Beispiele: {LOGO_NAME_EXAMPLES.join(' · ')}
        </p>
      </div>

      <div>
        <FieldLabel>Untertitel (optional)</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {LOGO_SUBTITLE_PRESETS.map((subtitle) => (
            <StudioOptionPill
              key={subtitle}
              active={form.logoSubtitle === subtitle}
              onClick={() =>
                onFormChange({
                  logoSubtitle: form.logoSubtitle === subtitle ? '' : subtitle,
                })
              }
              className="text-[10px]"
            >
              {subtitle}
            </StudioOptionPill>
          ))}
        </div>
      </div>

      {nameAnalysis && hasName && (
        <div className="rounded-lg border border-[var(--ucbs-accent-purple)]/25 bg-[var(--ucbs-accent-purple)]/5 p-3">
          <p className="flex items-center gap-2 text-xs text-[var(--ucbs-accent-purple)]">
            <Wand2 className="h-3.5 w-3.5 shrink-0" />
            {nameAnalysis.summary}
          </p>
          <p className="mt-1 text-[10px] text-zinc-500">
            Vorgeschlagener Stil: <span className="text-zinc-300">{nameAnalysis.suggestedStyle}</span>
            {' · '}
            {nameAnalysis.styleReason}
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          className="h-auto min-h-11 gap-2 whitespace-normal py-2.5 text-left text-xs sm:text-sm"
          onClick={onGenerateFromName}
          loading={loading}
          disabled={disabled || !hasName}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          Logo passend zum Namen generieren
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-11 gap-2 whitespace-normal border-[var(--ucbs-accent-purple)]/30 py-2.5 text-left text-xs hover:border-[var(--ucbs-accent-purple)]/50 sm:text-sm"
          onClick={onGenerateRandom}
          loading={loading}
          disabled={disabled}
        >
          <Shuffle className="h-4 w-4 shrink-0 text-[var(--ucbs-accent-purple)]" />
          Zufälliges Logo generieren
        </Button>
      </div>

      <p className="text-center text-[10px] text-zinc-600">
        Jede Generierung erstellt Variante A + B ({coinCost} Coins)
      </p>
    </GlassCard>
  );
}
