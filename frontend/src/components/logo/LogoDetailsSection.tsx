import {
  DEFAULT_LOGO_DETAILS,
  LOGO_DETAILS_CONTROLS,
  resolveLogoDetails,
  type LogoGenerationOptions,
  type LogoDetailsKey,
} from '@ucbs/shared';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoDetailsSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

function DetailsSlider({
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
        <span className="font-mono text-[10px] text-[var(--ucbs-accent-green)]">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--ucbs-accent-green)]"
        aria-label={label}
      />
    </div>
  );
}

const DETAILS_PRESETS: { id: string; label: string; values: Partial<typeof DEFAULT_LOGO_DETAILS> }[] = [
  {
    id: 'aaa',
    label: 'AAA Quality',
    values: { detail: 85, realism: 80, sharpness: 82, contrast: 75, saturation: 65, texture: 70 },
  },
  {
    id: 'clean',
    label: 'Clean Flat',
    values: { detail: 35, realism: 25, sharpness: 55, contrast: 50, saturation: 45, texture: 20 },
  },
  {
    id: 'hyper',
    label: 'Hyper Real',
    values: { detail: 92, realism: 95, sharpness: 88, contrast: 80, saturation: 58, texture: 85 },
  },
  {
    id: 'esports',
    label: 'Esports Sharp',
    values: { detail: 75, realism: 60, sharpness: 90, contrast: 85, saturation: 78, texture: 55 },
  },
  {
    id: 'soft',
    label: 'Soft Stylized',
    values: { detail: 45, realism: 35, sharpness: 40, contrast: 42, saturation: 55, texture: 35 },
  },
];

export function LogoDetailsSection({ form, onFormChange }: LogoDetailsSectionProps) {
  const details = resolveLogoDetails(form);

  function setDetails(key: LogoDetailsKey, value: number) {
    onFormChange({
      logoDetails: {
        ...form.logoDetails,
        [key]: value,
      },
    });
  }

  function applyPreset(values: Partial<typeof DEFAULT_LOGO_DETAILS>) {
    onFormChange({
      logoDetails: {
        ...DEFAULT_LOGO_DETAILS,
        ...values,
      },
    });
  }

  function resetDetails() {
    onFormChange({ logoDetails: { ...DEFAULT_LOGO_DETAILS } });
  }

  return (
    <GlassCard accent="green" hover={false} className="space-y-4 !p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-green)]">
            Schritt 9 · Logo-Details
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Detailgrad, Realismus, Schärfe, Kontrast, Sättigung und Textur — Qualitätssteuerung für den MAGIK-Prompt.
          </p>
        </div>
        <button
          type="button"
          onClick={resetDetails}
          className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Zurücksetzen
        </button>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {DETAILS_PRESETS.map((preset) => (
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
        {LOGO_DETAILS_CONTROLS.map(({ key, label, hint }) => (
          <DetailsSlider
            key={key}
            label={label}
            hint={hint}
            value={details[key]}
            onChange={(v) => setDetails(key, v)}
          />
        ))}
      </div>
    </GlassCard>
  );
}
