import {
  DEFAULT_LOGO_AI_SETTINGS,
  LOGO_AI_CONTROLS,
  resolveLogoAiSettings,
  type LogoGenerationOptions,
  type LogoAiSettingsKey,
} from '@ucbs/shared';
import { Brain } from 'lucide-react';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoAiSettingsSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

function AiSlider({
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
        <span className="font-mono text-[10px] text-[var(--ucbs-accent-purple)]">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--ucbs-accent-purple)]"
        aria-label={label}
      />
    </div>
  );
}

const AI_PRESETS: { id: string; label: string; values: Partial<typeof DEFAULT_LOGO_AI_SETTINGS> }[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    values: { creativity: 55, promptStrength: 72, styleAdherence: 68, variation: 48, coherence: 62, qualityFocus: 75 },
  },
  {
    id: 'strict',
    label: 'Strikte Treue',
    values: { creativity: 30, promptStrength: 92, styleAdherence: 88, variation: 25, coherence: 85, qualityFocus: 80 },
  },
  {
    id: 'creative',
    label: 'Kreativ',
    values: { creativity: 85, promptStrength: 55, styleAdherence: 45, variation: 78, coherence: 50, qualityFocus: 65 },
  },
  {
    id: 'aaa',
    label: 'AAA Qualität',
    values: { creativity: 45, promptStrength: 80, styleAdherence: 75, variation: 35, coherence: 80, qualityFocus: 95 },
  },
  {
    id: 'wild',
    label: 'Experimentell',
    values: { creativity: 95, promptStrength: 40, styleAdherence: 35, variation: 90, coherence: 40, qualityFocus: 55 },
  },
];

export function LogoAiSettingsSection({ form, onFormChange }: LogoAiSettingsSectionProps) {
  const ai = resolveLogoAiSettings(form);

  function setAi(key: LogoAiSettingsKey, value: number) {
    onFormChange({
      logoAiSettings: {
        ...form.logoAiSettings,
        [key]: value,
      },
    });
  }

  function applyPreset(values: Partial<typeof DEFAULT_LOGO_AI_SETTINGS>) {
    onFormChange({
      logoAiSettings: {
        ...DEFAULT_LOGO_AI_SETTINGS,
        ...values,
      },
    });
  }

  function resetAi() {
    onFormChange({ logoAiSettings: { ...DEFAULT_LOGO_AI_SETTINGS } });
  }

  return (
    <GlassCard accent="purple" hover={false} className="space-y-4 !p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
            <Brain className="h-3.5 w-3.5" />
            Schritt 11 · KI-Einstellungen
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Kreativität, Prompt-Stärke, Stiltreue, Variation, Kohärenz und Qualitätsfokus steuern die MAGIK-Generierung.
          </p>
        </div>
        <button
          type="button"
          onClick={resetAi}
          className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Zurücksetzen
        </button>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {AI_PRESETS.map((preset) => (
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
        {LOGO_AI_CONTROLS.map(({ key, label, hint }) => (
          <AiSlider
            key={key}
            label={label}
            hint={hint}
            value={ai[key]}
            onChange={(v) => setAi(key, v)}
          />
        ))}
      </div>
    </GlassCard>
  );
}
