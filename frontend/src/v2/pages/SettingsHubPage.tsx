import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { Skeleton } from '@/v2/components/Skeleton';
import { SETTINGS_LINKS } from '@/v2/config/navigation';
import { Button, Input } from '@/components/ui';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { api, ApiError, type CreatorDNA, type UserProfile } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { getFirebaseAuth, changeAccountPassword } from '@/lib/firebase';
import { formatAuthError } from '@/lib/auth-errors';
import {
  NEXTER_PLATFORM_LABELS,
  NEXTER_CREATION_INTEREST_LABELS,
  NEXTER_STYLE_PREFERENCE_LABELS,
  NEXTER_CREATOR_GOAL_LABELS,
  type NexterVoiceCatalogEntry,
} from '@ucbs/shared';
import {
  NexterPersonalizationFields,
  emptyPersonalizationDraft,
  type PersonalizationDraft,
} from '@/components/nexter/NexterPersonalizationFields';
import { applyNexterAppearance } from '@/lib/nexter-appearance';

const DISPLAY_NAME_MAX = 100;
const CONNECTED_PROVIDER_LABELS: Record<string, string> = {
  email: 'E-Mail / Passwort',
  google: 'Google',
};

const SECTIONS = [
  { id: 'profile', label: 'Profil' },
  { id: 'nexter-personalization', label: 'Nexter' },
  { id: 'language-voice', label: 'Sprache & Stimme' },
  { id: 'appearance', label: 'Erscheinungsbild' },
  { id: 'creator-preferences', label: 'Creator-Präferenzen' },
  { id: 'creator-dna', label: 'Creator DNA' },
  { id: 'account-security', label: 'Account & Sicherheit' },
  { id: 'account-data', label: 'Daten' },
  { id: 'feedback', label: 'Feedback' },
] as const;

function draftFromUser(user: UserProfile | null): PersonalizationDraft {
  const prefs = user?.nexterPreferences;
  const base = emptyPersonalizationDraft(prefs?.addressAs || user?.displayName || '');
  return {
    ...base,
    language: prefs?.language ?? user?.locale ?? base.language,
    addressAs: prefs?.addressAs || user?.displayName || '',
    voiceCatalogId: prefs?.voiceCatalogId ?? base.voiceCatalogId,
    voiceOutputEnabled: prefs?.voiceOutputEnabled !== false,
    uiTheme: prefs?.uiTheme ?? base.uiTheme,
    accentPreset: prefs?.accentPreset ?? base.accentPreset,
    customPrimary: prefs?.customPrimary ?? null,
    customAccent: prefs?.customAccent ?? null,
    platforms: prefs?.platforms ?? [],
    creationInterests: prefs?.creationInterests ?? [],
    stylePreferences: prefs?.stylePreferences ?? [],
    creatorGoals: prefs?.creatorGoals ?? [],
  };
}

function sanitizeClientDisplayName(name: string): { value: string; error: string | null } {
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return { value: cleaned, error: 'Anzeigename darf nicht leer sein' };
  if (cleaned.length > DISPLAY_NAME_MAX) return { value: cleaned, error: 'Anzeigename zu lang' };
  return { value: cleaned, error: null };
}

function sameDraft(a: PersonalizationDraft, b: PersonalizationDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-white/10 p-4 sm:p-6">
      <h2 className="font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DnaSummary({ dna }: { dna: CreatorDNA }) {
  const colors = [...(dna.primaryColors ?? []), ...(dna.accentColors ?? [])].slice(0, 6);
  const fonts = (dna.fonts ?? []).map((f) => f.name).filter(Boolean).slice(0, 3);
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs text-zinc-500">Name</dt>
        <dd className="text-zinc-200">{dna.name || '—'}</dd>
      </div>
      {dna.styleDirection ? (
        <div>
          <dt className="text-xs text-zinc-500">Stil</dt>
          <dd className="text-zinc-200">{dna.styleDirection}</dd>
        </div>
      ) : null}
      {dna.mascot ? (
        <div>
          <dt className="text-xs text-zinc-500">Motiv</dt>
          <dd className="text-zinc-200">{dna.mascot}</dd>
        </div>
      ) : null}
      {fonts.length ? (
        <div>
          <dt className="text-xs text-zinc-500">Schrift</dt>
          <dd className="text-zinc-200">{fonts.join(', ')}</dd>
        </div>
      ) : null}
      {colors.length ? (
        <div className="sm:col-span-2">
          <dt className="text-xs text-zinc-500">Farben</dt>
          <dd className="mt-1 flex flex-wrap gap-2" aria-label="DNA-Farben">
            {colors.map((c) => (
              <span key={c} className="flex items-center gap-1 text-zinc-300">
                <span className="h-5 w-5 rounded-full border border-white/20" style={{ background: c }} aria-hidden />
                {c}
              </span>
            ))}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function AccountDataSection() {
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);

  async function exportData() {
    setBusy('export');
    setStatus(null);
    try {
      const res = await api.auth.exportData();
      const blob = new Blob([JSON.stringify(res.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nexter-export.json';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Export heruntergeladen (ohne Secrets, nur eigene Daten).');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Export fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy('delete');
    setStatus(null);
    try {
      await api.auth.deleteAccount(confirm);
      setStatus('Konto deaktiviert und anonymisiert. Finanz-/Auditdaten bleiben technisch erhalten.');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        localStorage speichert u. a. auth_token. sessionStorage speichert Invite/Auth-Fehler. Firebase Auth
        hält die Sitzung. Kein Marketing-Tracking im aktuellen Stand.
      </p>
      <Button variant="ghost" className="min-h-11" loading={busy === 'export'} onClick={() => void exportData()}>
        Eigene Daten exportieren (JSON)
      </Button>
      <p className="text-xs text-zinc-500">Löschung: gib DELETE_ACCOUNT ein. Kein Ein-Klick.</p>
      <Input
        id="delete-account-confirm"
        label="Bestätigung"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="DELETE_ACCOUNT"
      />
      <Button
        className="min-h-11"
        disabled={confirm !== 'DELETE_ACCOUNT' || busy !== null}
        loading={busy === 'delete'}
        onClick={() => void deleteAccount()}
      >
        Konto löschen
      </Button>
      {status && (
        <p className="text-sm text-zinc-400" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

export function SettingsHubPage() {
  const location = useLocation();
  const { user, activeDna, loading: authLoading, refreshUser, logout, requestPasswordReset, isDevMode } =
    useAuth();
  const [draft, setDraft] = useState<PersonalizationDraft>(() => draftFromUser(user));
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [voices, setVoices] = useState<NexterVoiceCatalogEntry[]>([]);
  const [voiceCatalogError, setVoiceCatalogError] = useState<string | null>(null);
  const [ready, setReady] = useState(() => Boolean(user));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'ok' | 'error'>('ok');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('suggestion');
  const [screenshot, setScreenshot] = useState<string | undefined>();
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const savedDraft = useMemo(() => draftFromUser(user), [user]);
  const savedName = user?.displayName ?? '';
  const dirty = ready && (!sameDraft(draft, savedDraft) || displayName.trim() !== savedName.trim());

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setReady(false);
      return;
    }
    setDraft(draftFromUser(user));
    setDisplayName(user.displayName ?? '');
    setReady(true);
  }, [authLoading, user?.id]);

  useEffect(() => {
    api.nexter
      .voices()
      .then((r) => {
        setVoices(r.voices);
        setVoiceCatalogError(null);
      })
      .catch((err) => {
        setVoices([]);
        setVoiceCatalogError(
          err instanceof ApiError ? err.message : 'Stimmenkatalog konnte nicht geladen werden. Andere Einstellungen bleiben nutzbar.'
        );
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyNexterAppearance(draft);
  }, [draft, ready]);

  useEffect(() => {
    return () => {
      applyNexterAppearance(user?.nexterPreferences);
    };
  }, [user?.nexterPreferences]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!hash || !ready) return;
    document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, ready]);

  function discard() {
    setDraft(savedDraft);
    setDisplayName(savedName);
    applyNexterAppearance(user?.nexterPreferences);
    setProfileError(null);
    setPrefsError(null);
    setStatus('Änderungen verworfen.');
    setStatusTone('ok');
  }

  async function save() {
    if (saving || !user) return;
    const nameCheck = sanitizeClientDisplayName(displayName);
    if (nameCheck.error) {
      setProfileError(nameCheck.error);
      setStatus(nameCheck.error);
      setStatusTone('error');
      return;
    }
    setSaving(true);
    setStatus(null);
    setProfileError(null);
    setPrefsError(null);
    let profileOk = true;
    let prefsOk = true;
    let profileMsg: string | null = null;
    let prefsMsg: string | null = null;
    try {
      if (nameCheck.value !== savedName.trim()) {
        try {
          await api.auth.updateProfile({ displayName: nameCheck.value });
        } catch (err) {
          profileOk = false;
          profileMsg = err instanceof ApiError ? err.message : 'Profil speichern fehlgeschlagen';
          setProfileError(profileMsg);
        }
      }
      if (!sameDraft(draft, savedDraft)) {
        try {
          await api.auth.updateNexterPreferences({
            ...draft,
            addressAs: draft.addressAs.trim() || nameCheck.value || 'Creator',
            personalizationCompleted: true,
          });
        } catch (err) {
          prefsOk = false;
          prefsMsg = err instanceof ApiError ? err.message : 'Einstellungen speichern fehlgeschlagen';
          setPrefsError(prefsMsg);
        }
      }
      await refreshUser();
      if (profileOk && prefsOk) {
        setStatus('Einstellungen gespeichert.');
        setStatusTone('ok');
      } else {
        setStatus([profileMsg, prefsMsg].filter(Boolean).join(' ') || 'Teilweise gespeichert.');
        setStatusTone('error');
      }
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
      setStatusTone('error');
    } finally {
      setSaving(false);
    }
  }

  async function sendFeedback() {
    if (!message.trim() || sendingFeedback) return;
    setSendingFeedback(true);
    try {
      await api.feedback.submit({
        module: location.pathname,
        route: location.pathname,
        message: message.trim(),
        category,
        screenshotDataUrl: screenshot,
      });
      setMessage('');
      setScreenshot(undefined);
      setFeedbackStatus('Danke — Feedback ist bei Admin angekommen. Es wird keine E-Mail verschickt.');
    } catch (err) {
      setFeedbackStatus(err instanceof ApiError ? err.message : 'Senden fehlgeschlagen');
    } finally {
      setSendingFeedback(false);
    }
  }

  async function sendPasswordReset() {
    if (!user?.email) return;
    setResetting(true);
    setResetStatus(null);
    try {
      await requestPasswordReset(user.email);
      setResetStatus('Reset-Mail gesendet, falls das Konto E-Mail/Passwort nutzt.');
    } catch (err) {
      setResetStatus(err instanceof ApiError ? err.message : 'Passwort-Reset fehlgeschlagen');
    } finally {
      setResetting(false);
    }
  }

  async function submitPasswordChange() {
    setChangingPassword(true);
    setPasswordStatus(null);
    try {
      await changeAccountPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordStatus('Passwort wurde aktualisiert.');
    } catch (err) {
      setPasswordStatus(formatAuthError(err));
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogout() {
    if (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen und abmelden?')) return;
    discard();
    await logout();
  }

  const firebaseUser = getFirebaseAuth()?.currentUser ?? null;
  const emailVerified = user?.emailVerified ?? firebaseUser?.emailVerified;
  const needsEmailVerification = user?.needsEmailVerification === true;
  const canChangePassword = (user?.authProviders ?? []).includes('email') && !isDevMode;
  const connectedProviders = (user?.authProviders ?? []).filter((id) => id in CONNECTED_PROVIDER_LABELS);
  const nameError = displayName !== savedName ? sanitizeClientDisplayName(displayName).error : null;

  if (authLoading || !ready || !user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-28">
      <HubPageLayout
        title="Einstellungen"
        description="Profil, Nexter, Erscheinungsbild und Konto — dieselben Prefs wie im Onboarding."
        modules={SETTINGS_LINKS}
      >
        <nav aria-label="Einstellungsbereiche" className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-white/30 hover:text-white"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </HubPageLayout>

      <Section id="profile" title="Profil" description="Name in der App. Die Account-E-Mail kommt aus der Anmeldung.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="settings-display-name"
            label="Anzeigename"
            value={displayName}
            error={nameError ?? profileError ?? undefined}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="nickname"
          />
          <Input
            id="settings-email"
            label="Account-E-Mail"
            value={user.email}
            readOnly
            disabled
            autoComplete="email"
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Die E-Mail wird über Firebase Auth verwaltet und kann hier nicht geändert werden.
        </p>
      </Section>

      <Section
        id="nexter-personalization"
        title="Nexter"
        description="Wie Nexter dich anspricht. Creator-DNA-Farben für Logos bleiben unverändert."
      >
        <NexterPersonalizationFields
          draft={draft}
          onChange={setDraft}
          voices={voices}
          fields={['address']}
        />
      </Section>

      <Section
        id="language-voice"
        title="Sprache & Stimme"
        description="Zentrale Sprache und Stimmen aus dem Nexter-Katalog. Speichern erzeugt keine Stimme."
      >
        {voiceCatalogError && (
          <p className="mb-3 text-sm text-amber-200" role="alert">
            {voiceCatalogError}
          </p>
        )}
        <NexterPersonalizationFields
          draft={draft}
          onChange={setDraft}
          voices={voices}
          fields={['language', 'voice']}
        />
      </Section>

      <Section
        id="appearance"
        title="Erscheinungsbild"
        description="App-Theme und Farben. Vorschau gilt erst nach Speichern dauerhaft. DNA bleibt unberührt."
      >
        <NexterPersonalizationFields
          draft={draft}
          onChange={setDraft}
          voices={voices}
          fields={['design']}
        />
      </Section>

      <Section
        id="creator-preferences"
        title="Creator-Präferenzen"
        description="Plattformen, Interessen, Stil und Ziele — dieselben Felder wie im Nexter-Setup."
      >
        <NexterPersonalizationFields
          draft={draft}
          onChange={setDraft}
          voices={voices}
          fields={['platforms', 'interests', 'styles', 'goals']}
        />
        {(draft.platforms.length ||
          draft.creationInterests.length ||
          draft.stylePreferences.length ||
          draft.creatorGoals.length) > 0 && (
          <p className="mt-3 text-xs text-zinc-500">
            {[
              draft.platforms.map((id) => NEXTER_PLATFORM_LABELS[id]).join(', '),
              draft.creationInterests.map((id) => NEXTER_CREATION_INTEREST_LABELS[id]).join(', '),
              draft.stylePreferences.map((id) => NEXTER_STYLE_PREFERENCE_LABELS[id]).join(', '),
              draft.creatorGoals.map((id) => NEXTER_CREATOR_GOAL_LABELS[id]).join(', '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </Section>

      <Section
        id="creator-dna"
        title="Creator DNA"
        description="Markenidentität bleibt im DNA-Editor. Theme- und Stil-Prefs überschreiben sie nicht."
      >
        {activeDna ? (
          <div className="space-y-4">
            <DnaSummary dna={activeDna} />
            <Link
              to="/creator-dna"
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline"
            >
              Creator DNA bearbeiten
            </Link>
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-300">Noch keine Creator DNA.</p>
            <Link
              to="/creator-dna"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline"
            >
              Creator DNA einrichten
            </Link>
          </div>
        )}
      </Section>

      <Section id="account-security" title="Account & Sicherheit" description="Nur Funktionen, die wirklich angebunden sind.">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-500">Verbundene Anmeldung</dt>
            <dd className="text-zinc-200">
              {connectedProviders.length
                ? connectedProviders.map((id) => CONNECTED_PROVIDER_LABELS[id] ?? id).join(', ')
                : isDevMode
                  ? 'Dev-Login (lokal)'
                  : 'Nicht hinterlegt'}
            </dd>
          </div>
          {firebaseUser || user?.emailVerified !== undefined ? (
            <div>
              <dt className="text-xs text-zinc-500">E-Mail-Status (Firebase)</dt>
              <dd className="text-zinc-200" role="status">
                {needsEmailVerification
                  ? 'Nicht bestätigt — Studios, Coins und Nexter-Aktionen sind gesperrt, bis du deine E-Mail bestätigt hast.'
                  : emailVerified
                    ? 'Bestätigt'
                    : 'Nicht als verifiziert gemeldet'}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            loading={resetting}
            disabled={!user.email || isDevMode}
            onClick={() => void sendPasswordReset()}
          >
            Passwort-Reset senden
          </Button>
          <Button variant="ghost" className="min-h-11" onClick={() => void handleLogout()}>
            Abmelden
          </Button>
        </div>
        {canChangePassword && (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPasswordChange();
            }}
          >
            <Input
              id="settings-current-password"
              label="Aktuelles Passwort"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              id="settings-new-password"
              label="Neues Passwort"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <div className="sm:col-span-2">
              <Button className="min-h-11" type="submit" loading={changingPassword}>
                Passwort ändern
              </Button>
            </div>
          </form>
        )}
        {passwordStatus && (
          <p className="mt-2 text-sm text-zinc-400" role="status">
            {passwordStatus}
          </p>
        )}
        {resetStatus && (
          <p className="mt-2 text-sm text-zinc-400" role="status">
            {resetStatus}
          </p>
        )}
      </Section>

      <Section id="account-data" title="Daten & Konto" description="Export und Löschung über die bestehenden Account-APIs.">
        <AccountDataSection />
      </Section>

      <Section
        id="legal"
        title="Rechtliches"
        description="Entwürfe, keine geprüften Finalfassungen. Datenexport und Kontolöschung stehen unter Daten & Konto."
      >
        <LegalFooter />
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link to="/legal/widerruf" className="text-violet-300 underline underline-offset-2 hover:text-white">
            Widerruf
          </Link>
          <Link to="/legal/cookies" className="text-violet-300 underline underline-offset-2 hover:text-white">
            Speicher
          </Link>
          <a href="#account-data" className="text-violet-300 underline underline-offset-2 hover:text-white">
            Datenexport
          </a>
          <a href="#account-data" className="text-violet-300 underline underline-offset-2 hover:text-white">
            Konto löschen
          </a>
        </div>
      </Section>

      <div id="feedback" className="scroll-mt-24 rounded-2xl border border-white/10 p-4 sm:p-6">
        <h2 className="font-semibold text-white">Feedback senden</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Kategorie, Beschreibung, optionales Bild. Modul = aktuelle Seite. Für History und Bug-Kontext den Support-Hub
          nutzen.
        </p>
        <Link to="/support" className="mt-2 inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
          Zum Support-Hub
        </Link>
        <label htmlFor="fb-cat" className="mt-3 block text-xs text-zinc-400">
          Kategorie
        </label>
        <select
          id="fb-cat"
          className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm text-white"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {['bug', 'usability', 'generation', 'payment', 'suggestion', 'other'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Input
          className="mt-3"
          label="Beschreibung"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Was ist passiert?"
        />
        <label htmlFor="fb-shot" className="mt-3 block text-xs text-zinc-400">
          Screenshot (optional)
        </label>
        <input
          id="fb-shot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="mt-1 text-sm text-zinc-400"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setScreenshot(undefined);
              return;
            }
            if (file.size > 1_400_000) {
              setFeedbackStatus('Screenshot ist zu groß (max. ca. 1,4 MB).');
              setScreenshot(undefined);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setScreenshot(String(reader.result || ''));
            reader.readAsDataURL(file);
          }}
        />
        <Button
          className="mt-3 min-h-11"
          data-testid="feedback-send"
          loading={sendingFeedback}
          disabled={sendingFeedback}
          onClick={() => void sendFeedback()}
        >
          Feedback senden
        </Button>
        {feedbackStatus && (
          <p className="mt-2 text-sm text-zinc-400" role="status">
            {feedbackStatus}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[var(--ucbs-bg)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p
            className={`text-sm ${statusTone === 'error' ? 'text-red-300' : 'text-zinc-400'}`}
            role={statusTone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {prefsError || status || (dirty ? 'Ungespeicherte Änderungen' : 'Keine ungespeicherten Änderungen')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="min-h-11" disabled={!dirty || saving} onClick={discard}>
              Verwerfen
            </Button>
            <Button
              className="min-h-11"
              loading={saving}
              disabled={!dirty || saving}
              aria-busy={saving}
              onClick={() => void save()}
            >
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
