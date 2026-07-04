import { IMPROVEMENT_PRESETS, type ImprovementIntentId } from '@ucbs/shared';
import type { LogoGenerationOptions } from '@ucbs/shared';

type ImprovementChipsProps = {
  onApply: (patch: Partial<LogoGenerationOptions>, promptSuffix: string) => void;
  disabled?: boolean;
};

export function ImprovementChips({ onApply, disabled }: ImprovementChipsProps) {
  function apply(id: ImprovementIntentId) {
    const preset = IMPROVEMENT_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const patch: Partial<LogoGenerationOptions> = {};
    if (preset.magikStyle) patch.magikStyle = preset.magikStyle;
    if (preset.magikLogoArt) patch.magikLogoArt = preset.magikLogoArt;
    onApply(patch, preset.promptSuffix);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-400">KI-Verbesserung — ein Klick</p>
      <div className="flex flex-wrap gap-1">
        {IMPROVEMENT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            title={p.description}
            onClick={() => apply(p.id)}
            className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-400 transition hover:border-[var(--ucbs-accent-purple)]/40 hover:text-[var(--ucbs-accent-purple)] disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
