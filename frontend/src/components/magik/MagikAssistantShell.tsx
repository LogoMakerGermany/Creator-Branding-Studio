import { useState } from 'react';
import { Bot, ChevronUp, ChevronDown } from 'lucide-react';
import { MAGIK_AI_FEATURE_FLAGS, MAGIK_AI_UI } from '@/modules/magik-ai';

/**
 * Technische UI-Grundlage für den MAGIK AI Assistant.
 * Rechts unten, minimierbar, standardmäßig deaktiviert — keine Figur, keine Dialoge.
 */
export function MagikAssistantShell() {
  const [minimized, setMinimized] = useState<boolean>(MAGIK_AI_UI.defaultMinimized);

  if (!MAGIK_AI_FEATURE_FLAGS.showShell) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6"
      aria-hidden={!MAGIK_AI_FEATURE_FLAGS.assistantEnabled}
    >
      {!minimized && (
        <div
          className="pointer-events-auto w-72 rounded-xl border border-white/10 bg-[var(--ucbs-bg-elevated)]/95 p-4 shadow-2xl backdrop-blur-md"
          role="complementary"
          aria-label="MAGIK AI Assistant Platzhalter"
        >
          <div className="mb-2 flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--ucbs-accent-purple)]" aria-hidden />
            <span className="text-sm font-semibold text-white">MAGIK Assistant</span>
            <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
              {MAGIK_AI_UI.comingSoonLabel}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            Vorbereitungsphase — der persönliche Logo-Begleiter wird in Phase 2 aktiviert.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMinimized((v) => !v)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[var(--ucbs-bg-elevated)]/90 px-3 py-2 text-xs text-zinc-400 shadow-lg backdrop-blur-md transition hover:border-white/20 hover:text-zinc-200"
        aria-expanded={!minimized}
        aria-label={minimized ? 'MAGIK Assistant Panel öffnen' : 'MAGIK Assistant Panel minimieren'}
      >
        <Bot className="h-4 w-4 text-[var(--ucbs-accent-purple)]" />
        <span className="hidden sm:inline">MAGIK</span>
        {minimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
