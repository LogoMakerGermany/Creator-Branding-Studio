import {
  DEFAULT_LOGO_CAMERA,
  LOGO_CAMERA_CONTROLS,
  resolveLogoCamera,
  type LogoGenerationOptions,
  type LogoCameraKey,
} from '@ucbs/shared';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoCameraSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

function CameraSlider({
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

const CAMERA_PRESETS: { id: string; label: string; values: Partial<typeof DEFAULT_LOGO_CAMERA> }[] = [
  {
    id: 'hero',
    label: 'Hero Shot',
    values: { zoom: 75, rotation: 50, perspective: 60, angle: 35, depthOfField: 65 },
  },
  {
    id: 'closeup',
    label: 'Close-Up',
    values: { zoom: 90, rotation: 50, perspective: 70, angle: 45, depthOfField: 80 },
  },
  {
    id: 'wide',
    label: 'Weitwinkel',
    values: { zoom: 25, rotation: 50, perspective: 20, angle: 55, depthOfField: 30 },
  },
  {
    id: 'isometric',
    label: 'Isometrisch',
    values: { zoom: 55, rotation: 50, perspective: 45, angle: 85, depthOfField: 40 },
  },
  {
    id: 'dynamic',
    label: 'Dynamic Tilt',
    values: { zoom: 65, rotation: 78, perspective: 55, angle: 30, depthOfField: 55 },
  },
];

export function LogoCameraSection({ form, onFormChange }: LogoCameraSectionProps) {
  const camera = resolveLogoCamera(form);

  function setCamera(key: LogoCameraKey, value: number) {
    onFormChange({
      logoCamera: {
        ...form.logoCamera,
        [key]: value,
      },
    });
  }

  function applyPreset(values: Partial<typeof DEFAULT_LOGO_CAMERA>) {
    onFormChange({
      logoCamera: {
        ...DEFAULT_LOGO_CAMERA,
        ...values,
      },
    });
  }

  function resetCamera() {
    onFormChange({ logoCamera: { ...DEFAULT_LOGO_CAMERA } });
  }

  return (
    <GlassCard accent="purple" hover={false} className="space-y-4 !p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
            Schritt 8 · Kamera
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Zoom, Rotation, Perspektive, Winkel und Tiefenschärfe — steuert die Kamera-Phrase im MAGIK-Prompt.
          </p>
        </div>
        <button
          type="button"
          onClick={resetCamera}
          className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Zurücksetzen
        </button>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {CAMERA_PRESETS.map((preset) => (
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
        {LOGO_CAMERA_CONTROLS.map(({ key, label, hint }) => (
          <CameraSlider
            key={key}
            label={label}
            hint={hint}
            value={camera[key]}
            onChange={(v) => setCamera(key, v)}
          />
        ))}
      </div>
    </GlassCard>
  );
}
