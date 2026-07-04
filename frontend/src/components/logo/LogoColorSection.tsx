import {
  DEFAULT_LOGO_COLORS,
  LOGO_COLOR_FIELDS,
  MAGIK_COLOR_PALETTES,
  applyLogoPaletteToForm,
  buildLogoGradientCss,
  syncLogoSelectedColors,
  type LogoGenerationOptions,
  type LogoColorField,
} from '@ucbs/shared';
import { Input } from '@/components/ui';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoColorSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
  colorError?: string;
};

const COLOR_DEFAULTS: Record<LogoColorField, string> = {
  primaryColor: DEFAULT_LOGO_COLORS.primary,
  secondaryColor: DEFAULT_LOGO_COLORS.secondary,
  accentColor: DEFAULT_LOGO_COLORS.accent,
  glowColor: DEFAULT_LOGO_COLORS.glow,
  backgroundColor: DEFAULT_LOGO_COLORS.background,
};

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-zinc-400">{label}</label>
        <span className="hidden text-[9px] text-zinc-600 sm:inline">{hint}</span>
      </div>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(v) || v.length <= 7) onChange(v);
          }}
          className="font-mono text-xs uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export function LogoColorSection({ form, onFormChange, colorError }: LogoColorSectionProps) {
  const gradientCss = buildLogoGradientCss(form);

  function setColor(key: LogoColorField, hex: string) {
    const next = { ...form, [key]: hex } as LogoGenerationOptions;
    onFormChange({
      [key]: hex,
      selectedColors: syncLogoSelectedColors(next),
    });
  }

  function applyPalette(colors: string[]) {
    onFormChange(applyLogoPaletteToForm(form, colors));
  }

  function toggleGradient() {
    const enabled = !form.logoGradientEnabled;
    onFormChange({
      logoGradientEnabled: enabled,
      logoGradientFrom: form.logoGradientFrom ?? form.primaryColor ?? DEFAULT_LOGO_COLORS.gradientFrom,
      logoGradientTo: form.logoGradientTo ?? form.secondaryColor ?? DEFAULT_LOGO_COLORS.gradientTo,
      logoGradientAngle: form.logoGradientAngle ?? 135,
      selectedColors: syncLogoSelectedColors({
        ...form,
        logoGradientEnabled: enabled,
      }),
    });
  }

  return (
    <GlassCard accent="green" hover={false} className="space-y-4 !p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-green)]">
          Schritt 3 · Farben
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Primär-, Sekundär-, Akzent-, Glow- und Hintergrundfarbe — optional mit Farbverlauf.
        </p>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Schnell-Paletten</p>
        <div className="flex flex-wrap gap-1.5">
          {MAGIK_COLOR_PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPalette([...p.colors])}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-zinc-400 transition hover:border-[var(--ucbs-accent-green)]/40 hover:text-zinc-200"
            >
              {p.colors.map((c) => (
                <span key={c} className="h-3 w-3 rounded-full ring-1 ring-white/10" style={{ backgroundColor: c }} />
              ))}
              {p.id}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {LOGO_COLOR_FIELDS.map(({ key, label, hint }) => (
          <ColorField
            key={key}
            label={label}
            hint={hint}
            value={form[key] ?? COLOR_DEFAULTS[key]}
            onChange={(hex) => setColor(key, hex)}
          />
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-[var(--ucbs-bg)]/40 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-zinc-300">Farbverlauf</p>
            <p className="text-[10px] text-zinc-600">Verlauf für Logo-Flächen oder Hintergrund</p>
          </div>
          <StudioOptionPill active={!!form.logoGradientEnabled} onClick={toggleGradient} className="text-[10px]">
            {form.logoGradientEnabled ? 'Aktiv' : 'Aus'}
          </StudioOptionPill>
        </div>

        {form.logoGradientEnabled && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField
                label="Verlauf Start"
                hint="Von"
                value={form.logoGradientFrom ?? form.primaryColor ?? DEFAULT_LOGO_COLORS.gradientFrom}
                onChange={(hex) =>
                  onFormChange({
                    logoGradientFrom: hex,
                    selectedColors: syncLogoSelectedColors({ ...form, logoGradientFrom: hex }),
                  })
                }
              />
              <ColorField
                label="Verlauf Ende"
                hint="Bis"
                value={form.logoGradientTo ?? form.secondaryColor ?? DEFAULT_LOGO_COLORS.gradientTo}
                onChange={(hex) =>
                  onFormChange({
                    logoGradientTo: hex,
                    selectedColors: syncLogoSelectedColors({ ...form, logoGradientTo: hex }),
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">Winkel ({form.logoGradientAngle ?? 135}°)</label>
              <input
                type="range"
                min={0}
                max={360}
                value={form.logoGradientAngle ?? 135}
                onChange={(e) => onFormChange({ logoGradientAngle: Number(e.target.value) })}
                className="w-full accent-[var(--ucbs-accent-green)]"
              />
            </div>
            {gradientCss && (
              <div
                className="h-10 w-full rounded-lg border border-white/10"
                style={{ background: gradientCss }}
                aria-hidden
              />
            )}
          </div>
        )}
      </div>

      {colorError && <p className="text-xs text-red-400">{colorError}</p>}
    </GlassCard>
  );
}
