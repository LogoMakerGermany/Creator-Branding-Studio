import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { Button, Input } from '@/components/ui';

const DRAFT_KEY = 'nexter-onboarding-draft';

const PLATFORMS = ['Twitch', 'YouTube', 'TikTok', 'Kick', 'Instagram'];
const STYLES = ['gaming', 'streaming', 'esports', 'neon', 'minimal', 'anime', 'cinematic', 'dark'] as const;
const CATEGORIES = ['gaming', 'variety', 'music', 'art', 'lifestyle', 'education', 'entertainment', 'other'] as const;
const ASSISTANT_TONES = [
  { id: 'concise', label: 'Kurz und direkt' },
  { id: 'balanced', label: 'Ausgewogen' },
  { id: 'detailed', label: 'Ausführlich' },
] as const;

type Draft = {
  step: number;
  displayName: string;
  alias: string;
  purpose: string;
  category: (typeof CATEGORIES)[number];
  topics: string;
  platforms: string[];
  primary: string;
  secondary: string;
  style: (typeof STYLES)[number];
  mascot: string;
  assistantTone: (typeof ASSISTANT_TONES)[number]['id'];
};

const DEFAULTS: Draft = {
  step: 0,
  displayName: '',
  alias: '',
  purpose: 'Streaming',
  category: 'gaming',
  topics: '',
  platforms: ['Twitch'],
  primary: '#1E40AF',
  secondary: '#22D3EE',
  style: 'gaming',
  mascot: '',
  assistantTone: 'balanced',
};

function loadDraft(name: string): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Draft>;
      return {
        ...DEFAULTS,
        ...parsed,
        displayName: parsed.displayName || name,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS, displayName: name };
}

export function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => loadDraft(user?.displayName ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.needsEmailVerification) {
      navigate('/verify-email', { replace: true });
      return;
    }
    if (!user?.onboardingCompleted) return;
    if (user.nexterPreferences?.personalizationCompleted === true) {
      navigate('/dashboard', { replace: true });
      return;
    }
    navigate('/nexter-setup', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const greetName = draft.displayName.trim() || user?.displayName || 'Creator';

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const name = draft.displayName.trim() || user?.displayName || 'Creator';
      const existing = await api.dna.active();
      if (!existing.dna) {
        await api.dna.create({
          name,
          mascot: draft.mascot.trim() || undefined,
          styleDirection: draft.style,
          primaryColors: [draft.primary],
          secondaryColors: [draft.secondary],
          targetPlatforms: draft.platforms.map((p) => p.toLowerCase()),
          brandingStyle: draft.purpose,
          favoriteGenres: draft.topics
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          identity: {
            alias: draft.alias.trim() || undefined,
            creatorCategory: draft.category,
          },
          contentCategories: [draft.category],
          visualStyles: [draft.style],
          outputPrefs: { platform: draft.platforms[0]?.toLowerCase() },
          assistant: { assistantTone: draft.assistantTone, askBeforeMajorChanges: true },
        });
      }
      await api.auth.completeOnboarding(name);
      sessionStorage.removeItem(DRAFT_KEY);
      await refreshUser();
      navigate('/nexter-setup', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Onboarding fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  const last = 6;
  const canNext = draft.step === 0 ? draft.displayName.trim().length >= 2 : true;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-8">
      <h1 className="font-display text-3xl font-bold text-white">Willkommen bei NEXTER</h1>
      <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm text-violet-100" role="status">
        Hallo {greetName}, ich bin Nexter, dein persönlicher Creator-Assistent. Zuerst legen wir deine Creator-DNA
        an — danach stimme ich die App auf dich ab.
      </p>
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {draft.step === 0 && (
        <div className="space-y-4">
          <Input
            id="onboarding-name"
            label="Creator-Name"
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
          />
          <Input
            id="onboarding-alias"
            label="Alias / Anzeigename (optional)"
            value={draft.alias}
            onChange={(e) => setDraft({ ...draft, alias: e.target.value })}
          />
        </div>
      )}
      {draft.step === 1 && (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-zinc-300">Was machst du hauptsächlich?</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm capitalize text-zinc-200">
                  <input
                    type="radio"
                    name="category"
                    checked={draft.category === c}
                    onChange={() => setDraft({ ...draft, category: c, purpose: c })}
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
          <Input
            id="onboarding-purpose"
            label="Games / Themen (optional, kommagetrennt)"
            value={draft.topics}
            onChange={(e) => setDraft({ ...draft, topics: e.target.value, purpose: e.target.value || draft.category })}
          />
        </div>
      )}
      {draft.step === 2 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-300">Bevorzugte Plattformen</legend>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = draft.platforms.includes(p);
              return (
                <label key={p} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        platforms: on ? draft.platforms.filter((x) => x !== p) : [...draft.platforms, p],
                      })
                    }
                  />
                  {p}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {draft.step === 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="onboarding-primary" className="mb-1 block text-sm text-zinc-300">
              Primärfarbe (Creator DNA)
            </label>
            <input
              id="onboarding-primary"
              type="color"
              value={draft.primary}
              onChange={(e) => setDraft({ ...draft, primary: e.target.value })}
              className="h-10 w-full rounded border border-white/10 bg-transparent"
            />
          </div>
          <div>
            <label htmlFor="onboarding-secondary" className="mb-1 block text-sm text-zinc-300">
              Zweitfarbe (Creator DNA)
            </label>
            <input
              id="onboarding-secondary"
              type="color"
              value={draft.secondary}
              onChange={(e) => setDraft({ ...draft, secondary: e.target.value })}
              className="h-10 w-full rounded border border-white/10 bg-transparent"
            />
          </div>
        </div>
      )}
      {draft.step === 4 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-300">Stil</legend>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <label key={s} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm capitalize text-zinc-200">
                <input
                  type="radio"
                  name="style"
                  checked={draft.style === s}
                  onChange={() => setDraft({ ...draft, style: s })}
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {draft.step === 5 && (
        <Input
          id="onboarding-mascot"
          label="Figur / Mascot (optional)"
          value={draft.mascot}
          onChange={(e) => setDraft({ ...draft, mascot: e.target.value })}
        />
      )}
      {draft.step === 6 && (
        <div className="space-y-4 text-sm text-zinc-300">
          <p>Creator DNA wird mit Name, Plattformen, Farben und Stil angelegt — kurz, nicht als Fragebogen.</p>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-zinc-300">Wie soll Nexter mit dir arbeiten?</legend>
            <div className="flex flex-wrap gap-2">
              {ASSISTANT_TONES.map((tone) => (
                <label key={tone.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200">
                  <input
                    type="radio"
                    name="assistantTone"
                    checked={draft.assistantTone === tone.id}
                    onChange={() => setDraft({ ...draft, assistantTone: tone.id })}
                  />
                  {tone.label}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-zinc-500">
            Danach stimmen wir nur noch App-Ansprache und Stimme ab. DNA-Farben bleiben für Logos. Bestehende Accounts
            werden nicht erneut durch Onboarding gezwungen.
          </p>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={draft.step === 0 || saving}
          onClick={() => setDraft({ ...draft, step: Math.max(0, draft.step - 1) })}
        >
          Zurück
        </Button>
        {draft.step < last ? (
          <Button
            data-testid="onboarding-next"
            className="min-h-11"
            disabled={!canNext || saving}
            onClick={() => setDraft({ ...draft, step: draft.step + 1 })}
          >
            Weiter
          </Button>
        ) : (
          <Button data-testid="onboarding-finish" className="min-h-11" loading={saving} onClick={() => void finish()}>
            DNA speichern und weiter
          </Button>
        )}
      </div>
    </div>
  );
}
