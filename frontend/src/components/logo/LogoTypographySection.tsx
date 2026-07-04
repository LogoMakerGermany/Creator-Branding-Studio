import {
  DEFAULT_LOGO_TYPOGRAPHY,
  LOGO_FONT_PRESETS,
  LOGO_TYPOGRAPHY_CONTROLS,
  getLogoFontPreset,
  resolveLogoTypography,
  type LogoGenerationOptions,
  type LogoTypographyKey,
} from '@ucbs/shared';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoTypographySectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

function TypographySlider({
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

const TYPOGRAPHY_PRESETS: { id: string; label: string; values: Partial<typeof DEFAULT_LOGO_TYPOGRAPHY> }[] = [
  {
    id: 'esports',
    label: 'Esports Bold',
    values: { fontFamily: 'esports', size: 72, weight: 88, outline: 55, glow: 45, letterSpacing: 42 },
  },
  {
    id: 'neon',
    label: 'Neon Glow',
    values: { fontFamily: 'neon', size: 65, weight: 75, outline: 35, glow: 92, letterSpacing: 58 },
  },
  {
    id: 'military',
    label: 'Military',
    values: { fontFamily: 'military', size: 58, weight: 82, outline: 60, glow: 20, letterSpacing: 72 },
  },
  {
    id: 'minimal',
    label: 'Clean Minimal',
    values: { fontFamily: 'minimal', size: 50, weight: 55, outline: 10, glow: 15, letterSpacing: 35 },
  },
  {
    id: 'horror',
    label: 'Horror',
    values: { fontFamily: 'horror', size: 68, weight: 90, outline: 70, glow: 55, letterSpacing: 38 },
  },
];

export function LogoTypographySection({ form, onFormChange }: LogoTypographySectionProps) {
  const typography = resolveLogoTypography(form);
  const activeFont = getLogoFontPreset(typography.fontFamily);

  function setTypography(key: LogoTypographyKey, value: number) {
    onFormChange({
      logoTypography: {
        ...form.logoTypography,
        [key]: value,
      },
    });
  }

  function setFontFamily(fontFamily: string) {
    onFormChange({
      logoTypography: {
        ...form.logoTypography,
        fontFamily,
      },
    });
  }

  function applyPreset(values: Partial<typeof DEFAULT_LOGO_TYPOGRAPHY>) {
    onFormChange({
      logoTypography: {
        ...DEFAULT_LOGO_TYPOGRAPHY,
        ...values,
      },
    });
  }

  function resetTypography() {
    onFormChange({ logoTypography: { ...DEFAULT_LOGO_TYPOGRAPHY } });
  }

  return (
    <GlassCard accent="cyan" hover={false} className="space-y-4 !p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-cyan)]">
            Schritt 10 · Schrift
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Schriftart, Größe, Dicke, Kontur, Glow und Letter-Spacing für das Wordmark im MAGIK-Prompt.
          </p>
        </div>
        <button
          type="button"
          onClick={resetTypography}
          className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Zurücksetzen
        </button>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {TYPOGRAPHY_PRESETS.map((preset) => (
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

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Schriftart · {activeFont.label}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LOGO_FONT_PRESETS.map((font) => (
            <StudioOptionPill
              key={font.id}
              active={typography.fontFamily === font.id}
              onClick={() => setFontFamily(font.id)}
              className="text-[10px]"
            >
              {font.label}
            </StudioOptionPill>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LOGO_TYPOGRAPHY_CONTROLS.map(({ key, label, hint }) => (
          <TypographySlider
            key={key}
            label={label}
            hint={hint}
            value={typography[key]}
            onChange={(v) => setTypography(key, v)}
          />
        ))}
      </div>
    </GlassCard>
  );
}
