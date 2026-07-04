import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';
import {
  DEFAULT_MAGIK_STYLE,
  LOGO_STYLE_DESCRIPTIONS,
  LOGO_STYLE_GROUPS,
  LOGO_STUDIO_STYLE_PRESETS,
  normalizeMagikStyle,
  type LogoGenerationOptions,
  type LogoStudioStylePreset,
} from '@ucbs/shared';

type LogoStyleSectionProps = {
  form: LogoGenerationOptions;
  onStyleChange: (style: LogoStudioStylePreset) => void;
};

export function LogoStyleSection({ form, onStyleChange }: LogoStyleSectionProps) {
  const [query, setQuery] = useState('');
  const activeStyle = normalizeMagikStyle(form.magikStyle ?? DEFAULT_MAGIK_STYLE);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOGO_STYLE_GROUPS;
    return LOGO_STYLE_GROUPS.map((group) => ({
      ...group,
      styles: group.styles.filter((s) => s.toLowerCase().includes(q)),
    })).filter((group) => group.styles.length > 0);
  }, [query]);

  const flatFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return LOGO_STUDIO_STYLE_PRESETS.filter((s) => s.toLowerCase().includes(q));
  }, [query]);

  return (
    <GlassCard accent="purple" hover={false} className="space-y-4 !p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
          Schritt 2 · Stil-Auswahl
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Wähle den visuellen Stil für dein Logo — {LOGO_STUDIO_STYLE_PRESETS.length} Presets verfügbar.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Stil suchen…"
          className="pl-9 text-sm"
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-[var(--ucbs-bg)]/50 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-600">Aktiver Stil</p>
        <p className="text-sm font-medium text-white">{activeStyle}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{LOGO_STYLE_DESCRIPTIONS[activeStyle]}</p>
      </div>

      <div className="max-h-[320px] space-y-4 overflow-y-auto pr-1">
        {flatFiltered ? (
          <div className="flex flex-wrap gap-1.5">
            {flatFiltered.map((style) => (
              <StudioOptionPill
                key={style}
                active={activeStyle === style}
                onClick={() => onStyleChange(style)}
                className="text-[10px]"
                title={LOGO_STYLE_DESCRIPTIONS[style]}
              >
                {style}
              </StudioOptionPill>
            ))}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <section key={group.id}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.styles.map((style) => (
                  <StudioOptionPill
                    key={style}
                    active={activeStyle === style}
                    onClick={() => onStyleChange(style)}
                    className="text-[10px]"
                    title={LOGO_STYLE_DESCRIPTIONS[style]}
                  >
                    {style}
                  </StudioOptionPill>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </GlassCard>
  );
}
