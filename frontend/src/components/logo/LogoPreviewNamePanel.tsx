import { Sparkles, Shuffle, Wand2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { GlassCard } from '@/v2/components/GlassCard';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { LOGO_SUBTITLE_PRESETS, type LogoGenerationOptions } from '@ucbs/shared';

type NameAnalysis = {
  summary: string;
  suggestedStyle: string;
  styleReason: string;
} | null;

type LogoPreviewNamePanelProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
  nameAnalysis: NameAnalysis;
  nameError?: string;
  loading: boolean;
  disabled: boolean;
  onGenerateFromName: () => void;
  onGenerateRandom?: () => void;
};

export function LogoPreviewNamePanel({
  form,
  onFormChange,
  nameAnalysis,
  nameError,
  loading,
  disabled,
  onGenerateFromName,
  onGenerateRandom,
}: LogoPreviewNamePanelProps) {
  const hasName = (form.logoName?.trim().length ?? 0) >= 2;

  return (
    <GlassCard accent="cyan" hover={false} className="space-y-4 !p-4" data-testid="logo-preview-name-panel">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-cyan)]">
          Schritt 1 · Name & KI-Generierung
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Name eingeben — MAGIK erkennt Symbole (Wolf, King, Ghost …) und baut den Prompt automatisch.
        </p>
      </div>

      <div>
        <label htmlFor="logo-preview-name" className="mb-1.5 block text-xs font-medium text-zinc-400">
          Name / Clan / Teamname <span className="text-[var(--ucbs-accent-cyan)]">*</span>
        </label>
        <Input
          id="logo-preview-name"
          data-testid="logo-name-input"
          placeholder="z. B. NeonWolf, ShadowKing, GhostClan"
          value={form.logoName ?? ''}
          onChange={(e) => onFormChange({ logoName: e.target.value })}
          className="text-sm"
        />
        {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
      </div>

      <div>
        <label htmlFor="logo-preview-subtitle" className="mb-1.5 block text-xs font-medium text-zinc-400">
          Untertitel (optional)
        </label>
        <Input
          id="logo-preview-subtitle"
          data-testid="logo-subtitle-input"
          placeholder="z. B. Gaming, Esports, Streamer …"
          value={form.logoSubtitle ?? ''}
          onChange={(e) => onFormChange({ logoSubtitle: e.target.value })}
          className="text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
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
        <div
          className="rounded-lg border border-[var(--ucbs-accent-purple)]/25 bg-[var(--ucbs-accent-purple)]/5 p-3"
          data-testid="logo-name-analysis"
        >
          <p className="flex items-center gap-2 text-xs text-[var(--ucbs-accent-purple)]">
            <Wand2 className="h-3.5 w-3.5 shrink-0" />
            {nameAnalysis.summary}
          </p>
          <p className="mt-1 text-[10px] text-zinc-500">
            Stil: <span className="text-zinc-300">{nameAnalysis.suggestedStyle}</span> · {nameAnalysis.styleReason}
          </p>
        </div>
      )}

      <Button
        type="button"
        data-testid="logo-generate-from-name-btn"
        className="h-auto min-h-11 w-full gap-2 whitespace-normal py-3 text-sm"
        onClick={onGenerateFromName}
        loading={loading}
        disabled={disabled || !hasName}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        Logo passend zum Namen generieren
      </Button>

      {onGenerateRandom && (
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-10 w-full gap-2 border-[var(--ucbs-accent-purple)]/30 text-xs"
          onClick={onGenerateRandom}
          loading={loading}
          disabled={disabled}
        >
          <Shuffle className="h-3.5 w-3.5 text-[var(--ucbs-accent-purple)]" />
          Zufälliges Logo generieren
        </Button>
      )}
    </GlassCard>
  );
}
