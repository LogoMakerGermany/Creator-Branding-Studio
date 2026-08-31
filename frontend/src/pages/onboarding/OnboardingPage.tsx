import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { Button, Input } from '@/components/ui';

const DRAFT_KEY = 'nexter-onboarding-draft';

const PLATFORMS = ['Twitch', 'YouTube', 'TikTok', 'Kick', 'Instagram'];
const STYLES = ['gaming', 'streaming', 'esports', 'neon', 'minimal', 'anime'] as const;

type Draft = {
  step: number;
  displayName: string;
  purpose: string;
  platforms: string[];
  primary: string;
  secondary: string;
  style: (typeof STYLES)[number];
  mascot: string;
};

const DEFAULTS: Draft = {
  step: 0,
  displayName: '',
  purpose: 'Streaming',
  platforms: ['Twitch'],
  primary: '#1E40AF',
  secondary: '#22D3EE',
  style: 'gaming',
  mascot: '',
};

function loadDraft(name: string): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw), displayName: JSON.parse(raw).displayName || name };
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
    if (user?.onboardingCompleted) {
      navigate('/dashboard', { replace: true });
    }
  }, [user?.onboardingCompleted, navigate]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const nexterLine = `Hallo ${draft.displayName || 'Creator'}, ich bin NEXTER. Ich helfe dir beim Aufbau deines Creator-Auftritts.`;

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const name = draft.displayName.trim() || user?.displayName || 'Creator';
      await api.dna.create({
        name,
        mascot: draft.mascot.trim() || undefined,
        styleDirection: draft.style,
        primaryColors: [draft.primary],
        secondaryColors: [draft.secondary],
        targetPlatforms: draft.platforms.map((p) => p.toLowerCase()),
        brandingStyle: draft.purpose,
      });
      await api.auth.completeOnboarding(name);
      sessionStorage.removeItem(DRAFT_KEY);
      await refreshUser();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Onboarding fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  const last = 6;
  const canNext =
    draft.step === 0 ? draft.displayName.trim().length >= 2 : true;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-8">
      <h1 className="font-display text-3xl font-bold text-white">Willkommen bei NEXTER</h1>
      <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm text-violet-100" role="status">
        {nexterLine}
      </p>
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {draft.step === 0 && (
        <Input
          id="onboarding-name"
          label="Name"
          value={draft.displayName}
          onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
        />
      )}
      {draft.step === 1 && (
        <Input
          id="onboarding-purpose"
          label="Creator-/Plattform-Ziel"
          value={draft.purpose}
          onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
        />
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
              Primärfarbe
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
              Zweitfarbe
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
        <div className="space-y-2 text-sm text-zinc-300">
          <p>Creator DNA wird mit Name, Farben, Stil und Plattformen angelegt.</p>
          <p className="text-xs text-zinc-500">
            App-Farben: keine zweite Theme-Engine in V1 — Standard-Studiofarben bleiben. Personalisierung später.
          </p>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button
          variant="ghost"
          disabled={draft.step === 0 || saving}
          onClick={() => setDraft({ ...draft, step: Math.max(0, draft.step - 1) })}
        >
          Zurück
        </Button>
        {draft.step < last ? (
          <Button
            data-testid="onboarding-next"
            disabled={!canNext || saving}
            onClick={() => setDraft({ ...draft, step: draft.step + 1 })}
          >
            Weiter
          </Button>
        ) : (
          <Button data-testid="onboarding-finish" loading={saving} onClick={() => void finish()}>
            DNA anlegen und starten
          </Button>
        )}
      </div>
    </div>
  );
}
