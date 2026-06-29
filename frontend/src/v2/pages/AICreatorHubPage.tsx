import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { GlassCard } from '@/v2/components/GlassCard';
import { AI_CREATOR_MODULES, AI_PROMPT_SUGGESTIONS } from '@/v2/config/navigation';
import { Button } from '@/components/ui';

export function AICreatorHubPage() {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    navigate('/ai-assistant', { state: { initialPrompt: prompt.trim() } });
  }

  return (
    <HubPageLayout
      title="AI Creator"
      description="Erstelle komplette Creator-Projekte mit KI — von der Idee bis zu passenden Assets."
      modules={AI_CREATOR_MODULES}
    >
      <GlassCard accent="cyan" className="!p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-zinc-300">Dein Creator-Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Beschreibe dein Branding-Projekt — Stil, Spiel, Plattform…"
            className="w-full resize-none rounded-xl border border-white/10 bg-[var(--ucbs-bg)] p-4 text-sm text-white placeholder:text-zinc-600 focus:border-[var(--ucbs-accent-cyan)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--ucbs-accent-cyan)]/30"
          />
          <div className="flex flex-wrap gap-2">
            {AI_PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPrompt(s)}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-[var(--ucbs-accent-purple)]/40 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
          <Button type="submit" className="gap-2" disabled={!prompt.trim()}>
            <Send className="h-4 w-4" />
            Mit KI Assistent starten
          </Button>
        </form>
      </GlassCard>
    </HubPageLayout>
  );
}
