import {
  LOGO_EFFECT_PRESETS,
  resolveLogoEffects,
  toggleLogoEffect,
  type LogoGenerationOptions,
  type LogoEffectId,
} from '@ucbs/shared';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoEffectsSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

function EffectCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={`logo-effect-${id}`}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
        checked
          ? 'border-[var(--ucbs-accent-green)]/50 bg-[var(--ucbs-accent-green)]/10 text-[var(--ucbs-accent-green)]'
          : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
      }`}
    >
      <input
        id={`logo-effect-${id}`}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-white/20 bg-[var(--ucbs-bg)] accent-[var(--ucbs-accent-green)]"
      />
      {label}
    </label>
  );
}

export function LogoEffectsSection({ form, onFormChange }: LogoEffectsSectionProps) {
  const active = resolveLogoEffects(form);

  function setEffect(id: LogoEffectId, enabled: boolean) {
    const current = resolveLogoEffects(form);
    const next = enabled ? toggleLogoEffect(current, id) : current.filter((x) => x !== id);
    onFormChange({ logoEffects: next });
  }

  function clearAll() {
    onFormChange({ logoEffects: [] });
  }

  function selectCommon() {
    onFormChange({ logoEffects: ['particles', 'energy', 'smoke'] });
  }

  return (
    <GlassCard accent="green" hover={false} className="space-y-4 !p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-green)]">
            Schritt 6 · Effekte
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Kombiniere visuelle Effekte — mehrere gleichzeitig möglich.
          </p>
        </div>
        <div className="flex gap-2 text-[10px]">
          <button type="button" onClick={selectCommon} className="text-zinc-500 hover:text-zinc-300 hover:underline">
            Esports-Preset
          </button>
          <button type="button" onClick={clearAll} className="text-zinc-500 hover:text-zinc-300 hover:underline">
            Alle aus
          </button>
        </div>
      </div>

      {active.length > 0 && (
        <p className="text-[11px] text-zinc-400">
          Aktiv:{' '}
          <span className="text-[var(--ucbs-accent-green)]">
            {active.map((id) => LOGO_EFFECT_PRESETS.find((e) => e.id === id)?.label).join(' · ')}
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LOGO_EFFECT_PRESETS.map(({ id, label }) => (
          <EffectCheckbox
            key={id}
            id={id}
            label={label}
            checked={active.includes(id)}
            onChange={(checked) => setEffect(id, checked)}
          />
        ))}
      </div>
    </GlassCard>
  );
}
