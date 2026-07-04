import {
  DEFAULT_LOGO_LIGHTING,
  LOGO_LIGHTING_CONTROLS,
  resolveLogoLighting,
  type LogoGenerationOptions,
  type LogoLightingKey,
} from '@ucbs/shared';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoLightingSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

function LightingSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-zinc-300">{label}</p>
          <p className="text-[9px] text-zinc-600">{hint}</p>
        </div>
        <span className="font-mono text-[10px] text-[var(--ucbs-accent-cyan)]">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--ucbs-accent-cyan)]"
        aria-label={label}
      />
    </div>
  );
}

const LIGHTING_PRESETS: { id: string; label: string; values: Partial<typeof DEFAULT_LOGO_LIGHTING> }[] = [
  {
    id: 'cinematic',
    label: 'Cinematic',
    values: { glow: 70, light: 75, shadow: 60, bloom: 65, hdr: 70, rimLight: 75, lensFlare: 45, reflections: 65, ambientLight: 40 },
  },
  {
    id: 'neon',
    label: 'Neon Glow',
    values: { glow: 95, light: 55, shadow: 35, bloom: 85, hdr: 60, rimLight: 80, lensFlare: 30, reflections: 50, ambientLight: 25 },
  },
  {
    id: 'soft',
    label: 'Soft Studio',
    values: { glow: 35, light: 60, shadow: 30, bloom: 40, hdr: 45, rimLight: 45, lensFlare: 15, reflections: 55, ambientLight: 70 },
  },
  {
    id: 'dramatic',
    label: 'Dramatic',
    values: { glow: 55, light: 85, shadow: 90, bloom: 50, hdr: 75, rimLight: 85, lensFlare: 55, reflections: 70, ambientLight: 20 },
  },
];

export function LogoLightingSection({ form, onFormChange }: LogoLightingSectionProps) {
  const lighting = resolveLogoLighting(form);

  function setLighting(key: LogoLightingKey, value: number) {
    onFormChange({
      logoLighting: {
        ...form.logoLighting,
        [key]: value,
      },
    });
  }

  function applyPreset(values: Partial<typeof DEFAULT_LOGO_LIGHTING>) {
    onFormChange({
      logoLighting: {
        ...DEFAULT_LOGO_LIGHTING,
        ...values,
      },
    });
  }

  function resetLighting() {
    onFormChange({ logoLighting: { ...DEFAULT_LOGO_LIGHTING } });
  }

  return (
    <GlassCard accent="cyan" hover={false} className="space-y-4 !p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-cyan)]">
            Schritt 4 · Beleuchtung
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Feinsteuerung von Glow, Licht, Schatten, Bloom, HDR und mehr — fließt in den MAGIK-Prompt ein.
          </p>
        </div>
        <button
          type="button"
          onClick={resetLighting}
          className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Zurücksetzen
        </button>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {LIGHTING_PRESETS.map((preset) => (
            <StudioOptionPill
              key={preset.id}
              active={false}
              onClick={() => applyPreset(preset.values)}
              className="text-[10px]"
            >
              {preset.label}
            </StudioOptionPill>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LOGO_LIGHTING_CONTROLS.map(({ key, label, hint }) => (
          <LightingSlider
            key={key}
            label={label}
            hint={hint}
            value={lighting[key]}
            onChange={(v) => setLighting(key, v)}
          />
        ))}
      </div>
    </GlassCard>
  );
}
