import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  NEXTER_LANGUAGE_LABELS,
  NEXTER_PLATFORM_LABELS,
  NEXTER_CREATION_INTEREST_LABELS,
  NEXTER_STYLE_PREFERENCE_LABELS,
  NEXTER_CREATOR_GOAL_LABELS,
  DEFAULT_NEXTER_LANGUAGE,
  isNexterLanguage,
  type NexterVoiceCatalogEntry,
} from '@ucbs/shared';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { Button } from '@/components/ui';
import {
  NexterPersonalizationFields,
  emptyPersonalizationDraft,
  type PersonalizationDraft,
} from '@/components/nexter/NexterPersonalizationFields';
import { applyNexterAppearance } from '@/lib/nexter-appearance';

const DRAFT_KEY = 'nexter-setup-draft';

const STEPS = [
  'intro',
  'address',
  'language',
  'voice',
  'design',
  'platforms',
  'interests',
  'styles',
  'goals',
  'summary',
] as const;

type Step = (typeof STEPS)[number];

function emptyDraft(name: string): PersonalizationDraft {
  return emptyPersonalizationDraft(name);
}

function loadDraft(userName: string, prefs?: PersonalizationDraft | null): { step: number; draft: PersonalizationDraft } {
  const base = emptyDraft(userName);
  const merge = (partial?: Partial<PersonalizationDraft>): PersonalizationDraft => ({
    ...base,
    ...partial,
    addressAs: partial?.addressAs?.trim() || base.addressAs,
    platforms: Array.isArray(partial?.platforms) ? partial.platforms : base.platforms,
    creationInterests: Array.isArray(partial?.creationInterests)
      ? partial.creationInterests
      : base.creationInterests,
    stylePreferences: Array.isArray(partial?.stylePreferences)
      ? partial.stylePreferences
      : base.stylePreferences,
    creatorGoals: Array.isArray(partial?.creatorGoals) ? partial.creatorGoals : base.creatorGoals,
    customPrimary: partial?.customPrimary === undefined ? base.customPrimary : partial.customPrimary,
    customAccent: partial?.customAccent === undefined ? base.customAccent : partial.customAccent,
  });
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { step?: number; draft?: Partial<PersonalizationDraft> };
      return {
        step: typeof parsed.step === 'number' ? Math.max(0, Math.min(STEPS.length - 1, parsed.step)) : 0,
        draft: merge(parsed.draft),
      };
    }
  } catch {
    /* ignore */
  }
  if (prefs) return { step: 0, draft: merge(prefs) };
  return { step: 0, draft: base };
}

function NexterBubble({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm leading-relaxed text-violet-100" role="status">
      {children}
    </p>
  );
}

export function NexterSetupPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const userName = user?.nexterPreferences?.addressAs || user?.displayName || '';
  const initial = loadDraft(userName, user?.nexterPreferences ?? null);
  const [step, setStep] = useState(initial.step);
  const [draft, setDraft] = useState<PersonalizationDraft>(initial.draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<NexterVoiceCatalogEntry[]>([]);

  useEffect(() => {
    if (user?.needsEmailVerification) {
      navigate('/verify-email', { replace: true });
      return;
    }
    if (!user?.onboardingCompleted) {
      navigate('/onboarding', { replace: true });
      return;
    }
    if (user.nexterPreferences?.personalizationCompleted) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    api.nexter
      .voices()
      .then((r) => setVoices(r.voices))
      .catch(() => setVoices([]));
  }, []);

  useEffect(() => {
    applyNexterAppearance(draft);
    return () => {
      applyNexterAppearance(user?.nexterPreferences);
    };
  }, [draft, user?.nexterPreferences]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, draft }));
  }, [step, draft]);

  const name = draft.addressAs.trim() || user?.displayName || 'Creator';
  const current = STEPS[step];

  const lines: Record<Step, string> = {
    intro: `Hallo ${name}, ich bin Nexter, dein persönlicher Creator-Assistent. Bevor wir loslegen, würde ich dich gerne kurz kennenlernen, damit ich die App auf dich abstimmen kann.`,
    address: 'Wie soll ich dich nennen? Echter Name, Creator-Name oder Nickname — wie du magst.',
    language: 'In welcher Sprache soll ich mit dir sprechen?',
    voice: 'Wie möchtest du, dass ich mit dir spreche? Du kannst später immer wechseln.',
    design:
      'Sind die aktuellen Farben für dich in Ordnung, oder möchtest du deine eigenen? Änderungen siehst du sofort als Vorschau.',
    platforms: 'Wo bist du hauptsächlich unterwegs?',
    interests: 'Was möchtest du mit Nexter erstellen? Noch nichts wird generiert — ich merke mir nur, was zu dir passt.',
    styles: 'Welcher Stil spricht dich an? Mehrfachauswahl ist möglich.',
    goals: 'Was möchtest du mit deinem Content erreichen?',
    summary: `Perfekt, ${name}. Ich habe jetzt eine erste Vorstellung davon, was zu dir passt.`,
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.auth.updateNexterPreferences({
        ...draft,
        addressAs: draft.addressAs.trim() || user?.displayName || 'Creator',
        personalizationCompleted: true,
      });
      sessionStorage.removeItem(DRAFT_KEY);
      await refreshUser();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  const fieldMap: Partial<Record<Step, Array<'language' | 'address' | 'voice' | 'design' | 'platforms' | 'interests' | 'styles' | 'goals'>>> = {
    address: ['address'],
    language: ['language'],
    voice: ['voice'],
    design: ['design'],
    platforms: ['platforms'],
    interests: ['interests'],
    styles: ['styles'],
    goals: ['goals'],
  };

  const canNext = current !== 'address' || draft.addressAs.trim().length >= 1;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-8">
      <h1 className="font-display text-3xl font-bold text-white">Dein Nexter</h1>
      <NexterBubble>{lines[current]}</NexterBubble>
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {current !== 'intro' && current !== 'summary' && fieldMap[current] && (
        <NexterPersonalizationFields
          draft={draft}
          onChange={setDraft}
          voices={voices}
          fields={fieldMap[current]!}
        />
      )}

      {current === 'summary' && (
        <ul className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
          <li>Name: {name}</li>
          <li>
            Sprache:{' '}
            {NEXTER_LANGUAGE_LABELS[isNexterLanguage(draft.language) ? draft.language : DEFAULT_NEXTER_LANGUAGE]}
          </li>
          <li>Stimme: {voices.find((v) => v.catalogId === draft.voiceCatalogId)?.label ?? 'Nexter Standard'}</li>
          <li>
            Farben:{' '}
            {draft.customPrimary || draft.customAccent
              ? `${draft.customPrimary ?? 'Standard'} + ${draft.customAccent ?? 'Standard'}`
              : 'Nexter Standard'}
          </li>
          <li>
            Plattformen:{' '}
            {draft.platforms.length
              ? draft.platforms.map((id) => NEXTER_PLATFORM_LABELS[id]).join(', ')
              : 'noch offen'}
          </li>
          <li>
            Interessen:{' '}
            {draft.creationInterests.length
              ? draft.creationInterests.map((id) => NEXTER_CREATION_INTEREST_LABELS[id]).join(', ')
              : 'noch offen'}
          </li>
          <li>
            Stil:{' '}
            {draft.stylePreferences.length
              ? draft.stylePreferences.map((id) => NEXTER_STYLE_PREFERENCE_LABELS[id]).join(', ')
              : 'noch offen'}
          </li>
          <li>
            Ziele:{' '}
            {draft.creatorGoals.length
              ? draft.creatorGoals.map((id) => NEXTER_CREATOR_GOAL_LABELS[id]).join(', ')
              : 'noch offen'}
          </li>
        </ul>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" className="min-h-11" disabled={step === 0 || saving} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Zurück
        </Button>
        {step < STEPS.length - 1 ? (
          <Button className="min-h-11" disabled={!canNext || saving} onClick={() => setStep((s) => s + 1)}>
            {current === 'intro' ? 'Los geht’s' : 'Weiter'}
          </Button>
        ) : (
          <Button data-testid="nexter-setup-finish" className="min-h-11" loading={saving} onClick={() => void save()}>
            Nexter starten
          </Button>
        )}
      </div>
    </div>
  );
}
