import { useRef, useState } from 'react';
import { Upload, ImageIcon, X } from 'lucide-react';
import {
  DEFAULT_LOGO_BACKGROUND,
  LOGO_STUDIO_BACKGROUND_PRESETS,
  applyLogoBackgroundSelection,
  resolveLogoBackground,
  type LogoGenerationOptions,
  type LogoStudioBackgroundId,
} from '@ucbs/shared';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoBackgroundSectionProps = {
  form: LogoGenerationOptions;
  onFormChange: (patch: Partial<LogoGenerationOptions>) => void;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

export function LogoBackgroundSection({ form, onFormChange }: LogoBackgroundSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const activeId = resolveLogoBackground(form);

  function selectBackground(id: LogoStudioBackgroundId) {
    onFormChange(applyLogoBackgroundSelection(id, form));
  }

  async function handleUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Bild max. 5 MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setUploadError('Nur Bilddateien erlaubt');
      return;
    }
    setUploadError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onFormChange({
        ...applyLogoBackgroundSelection('custom', form),
        logoBackgroundUpload: dataUrl,
        logoBackgroundUploadName: file.name,
      });
    } catch {
      setUploadError('Upload fehlgeschlagen');
    }
  }

  function clearUpload() {
    onFormChange({
      logoBackgroundUpload: undefined,
      logoBackgroundUploadName: undefined,
      logoBackground: form.logoBackground === 'custom' ? DEFAULT_LOGO_BACKGROUND : form.logoBackground,
      ...applyLogoBackgroundSelection(
        form.logoBackground && form.logoBackground !== 'custom'
          ? (form.logoBackground as LogoStudioBackgroundId)
          : DEFAULT_LOGO_BACKGROUND,
        form
      ),
    });
  }

  return (
    <GlassCard accent="cyan" hover={false} className="space-y-4 !p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-cyan)]">
          Schritt 7 · Hintergründe
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Wähle eine Hintergrund-Szene oder lade ein eigenes Bild hoch (max. 5 MB).
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LOGO_STUDIO_BACKGROUND_PRESETS.map(({ id, label }) => (
          <StudioOptionPill
            key={id}
            active={activeId === id}
            onClick={() => selectBackground(id)}
            className="text-[10px]"
          >
            {label}
          </StudioOptionPill>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-white/15 bg-[var(--ucbs-bg)]/40 p-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
        />

        {form.logoBackgroundUpload ? (
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10">
              <img
                src={form.logoBackgroundUpload}
                alt="Eigener Hintergrund"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="truncate text-xs text-zinc-400">{form.logoBackgroundUploadName ?? 'Eigenes Bild'}</p>
              <button
                type="button"
                onClick={clearUpload}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" /> Entfernen
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 py-4 text-zinc-500 transition hover:text-zinc-300"
          >
            <Upload className="h-8 w-8 text-[var(--ucbs-accent-cyan)]" />
            <span className="text-sm font-medium">Eigener Hintergrund hochladen</span>
            <span className="text-[10px]">PNG, JPG, WebP · max. 5 MB</span>
          </button>
        )}
      </div>

      {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

      {activeId === 'custom' && (
        <p className="flex items-center gap-2 text-[11px] text-[var(--ucbs-accent-cyan)]">
          <ImageIcon className="h-3.5 w-3.5" />
          Custom-Hintergrund aktiv — wird in den MAGIK-Prompt einbezogen
        </p>
      )}
    </GlassCard>
  );
}
