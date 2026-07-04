import {
  DEFAULT_LOGO_MATERIAL,
  LOGO_MATERIAL_GROUPS,
  LOGO_MATERIAL_PRESETS,
  getLogoMaterialPreset,
  resolveLogoMaterial,
  type LogoGenerationOptions,
  type LogoMaterialId,
} from '@ucbs/shared';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoMaterialSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

export function LogoMaterialSection({ form, onFormChange }: LogoMaterialSectionProps) {
  const activeId = resolveLogoMaterial(form);
  const active = getLogoMaterialPreset(activeId);
  const intensity = form.logoMaterialIntensity ?? 100;

  function selectMaterial(id: LogoMaterialId) {
    onFormChange({ logoMaterial: id });
  }

  return (
    <GlassCard accent="purple" hover={false} className="space-y-4 !p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
          Schritt 5 · Materialien
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Materialbibliothek für Oberflächen, Reflexionen und Textur des Logos.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--ucbs-accent-purple)]/25 bg-[var(--ucbs-accent-purple)]/5 px-3 py-2">
        <p className="text-sm font-medium text-white">{active.label}</p>
        <p className="text-[11px] text-zinc-500">{active.description}</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Materialstärke</p>
          <span className="font-mono text-[10px] text-[var(--ucbs-accent-purple)]">{intensity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={intensity}
          onChange={(e) => onFormChange({ logoMaterialIntensity: Number(e.target.value) })}
          className="w-full accent-[var(--ucbs-accent-purple)]"
          aria-label="Materialstärke"
        />
      </div>

      <div className="max-h-[280px] space-y-4 overflow-y-auto pr-1">
        {LOGO_MATERIAL_GROUPS.map((group) => (
          <section key={group.id}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.materials.map((id) => {
                const preset = LOGO_MATERIAL_PRESETS.find((m) => m.id === id)!;
                return (
                  <StudioOptionPill
                    key={id}
                    active={activeId === id}
                    onClick={() => selectMaterial(id)}
                    className="text-[10px]"
                    title={preset.description}
                  >
                    {preset.label}
                  </StudioOptionPill>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onFormChange({ logoMaterial: DEFAULT_LOGO_MATERIAL, logoMaterialIntensity: 100 })}
        className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
      >
        Standard (Metall) wiederherstellen
      </button>
    </GlassCard>
  );
}
