import { LOGO_STUDIO_TEMPLATES, getLogoTemplate, type LogoGenerationOptions } from '@ucbs/shared';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

type LogoTemplatesSectionProps = {
  form: LogoGenerationOptions;
  onApplyTemplate: (templateId: string) => void;
};

export function LogoTemplatesSection({ form, onApplyTemplate }: LogoTemplatesSectionProps) {
  const activeId = form.logoTemplate ?? null;
  const active = activeId ? getLogoTemplate(activeId) : null;

  return (
    <GlassCard accent="purple" hover={false} className="space-y-4 !p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
          Schritt 13 · Vorlagen
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Ein-Klick-Presets für COD, Fortnite, GTA, Valorant und mehr — setzt Stil, Farben, Material, Effekte und Hintergrund.
        </p>
      </div>

      {active && (
        <div
          className="rounded-lg border border-[var(--ucbs-accent-purple)]/30 bg-[var(--ucbs-accent-purple)]/5 p-3"
          style={{ borderLeftColor: active.accent, borderLeftWidth: 3 }}
        >
          <p className="text-sm font-medium text-white">{active.label}</p>
          <p className="mt-1 text-[10px] text-zinc-500">{active.description}</p>
          <div className="mt-2 flex gap-1.5">
            {active.colors.map((c) => (
              <div
                key={c}
                className="h-4 w-4 rounded-full border border-white/20"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {LOGO_STUDIO_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onApplyTemplate(template.id)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              activeId === template.id
                ? 'border-[var(--ucbs-accent-purple)]/50 bg-[var(--ucbs-accent-purple)]/10'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-zinc-200">{template.label}</p>
                <p className="mt-0.5 line-clamp-2 text-[9px] text-zinc-600">{template.description}</p>
              </div>
              <div
                className="h-3 w-3 shrink-0 rounded-full border border-white/20"
                style={{ backgroundColor: template.accent }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[8px] text-zinc-500">
                {template.magikStyle}
              </span>
              <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[8px] text-zinc-500">
                {template.logoEffects.length} Effekte
              </span>
            </div>
          </button>
        ))}
      </div>

      {activeId && (
        <div className="flex justify-end">
          <StudioOptionPill active={false} onClick={() => onApplyTemplate('')} className="text-[10px]">
            Vorlage entfernen
          </StudioOptionPill>
        </div>
      )}
    </GlassCard>
  );
}
