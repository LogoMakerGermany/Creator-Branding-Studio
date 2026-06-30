import { Bot, Lock } from 'lucide-react';
import { GlassCard } from '@/v2/components/GlassCard';
import {
  MAGIK_AI_PERSONALITIES,
  MAGIK_AI_PHASE,
  type MagikAiSettings,
} from '@/types/magik';
import { MAGIK_AI_UI } from '@/modules/magik-ai';

interface MagikAssistantSettingsPanelProps {
  settings: MagikAiSettings;
  locked?: boolean;
  onPersonalityChange?: (id: MagikAiSettings['personalityId']) => void;
  onLanguageChange?: (language: string) => void;
}

function LockedToggle({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-3 opacity-60">
      <div>
        <p className="text-sm font-medium text-zinc-300">{label}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-amber-200/80">
        <Lock className="h-3 w-3" />
        {MAGIK_AI_UI.comingSoonLabel}
      </div>
    </div>
  );
}

export function MagikAssistantSettingsPanel({
  settings,
  locked = true,
  onPersonalityChange,
  onLanguageChange,
}: MagikAssistantSettingsPanelProps) {
  return (
    <div className="space-y-6">
      <GlassCard accent="purple" hover={false}>
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-5 w-5 text-[var(--ucbs-accent-purple)]" />
          <div>
            <p className="font-medium text-white">MAGIK AI Assistant</p>
            <p className="mt-1 text-sm text-zinc-400">
              Phase: <span className="text-zinc-300">{MAGIK_AI_PHASE}</span> — Architektur vorbereitet,
              Aktivierung folgt nach dem Logo-Generator.
            </p>
          </div>
        </div>
      </GlassCard>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Funktionen</h2>
        <LockedToggle
          label="MAGIK Assistant aktivieren"
          description="Persönlicher Begleiter nach der Logo-Generierung (Phase 2)"
        />
        <LockedToggle label="Animationen" description="Avatar-Animationen und Reaktionen (Phase 3)" />
        <LockedToggle label="Sprache" description="Sprachinteraktion und Voice-Output (Phase 4)" />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Persönlichkeit</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {MAGIK_AI_PERSONALITIES.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={locked}
              onClick={() => onPersonalityChange?.(p.id)}
              className={`rounded-lg border p-3 text-left transition ${
                settings.personalityId === p.id
                  ? 'border-[var(--ucbs-accent-purple)]/50 bg-[var(--ucbs-accent-purple)]/10'
                  : 'border-white/10 hover:border-white/20'
              } ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <p className="text-sm font-medium text-zinc-200">{p.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{p.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-300">Sprache</h2>
        <select
          value={settings.language}
          disabled={locked}
          onChange={(e) => onLanguageChange?.(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-white/10 bg-[var(--ucbs-bg)] px-3 py-2 text-sm text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
        {locked && (
          <p className="mt-2 text-xs text-zinc-600">Sprache wird in Phase 4 freigeschaltet.</p>
        )}
      </section>
    </div>
  );
}
