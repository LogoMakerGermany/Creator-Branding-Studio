import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '@ucbs/shared';
import { Button, Input, CardTitle, CardDescription } from '@/components/ui';
import { GlassCard } from '@/v2/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import { formatAuthError } from '@/lib/auth-errors';
import { api } from '@/services/api';
import type { AuthProviderId } from '@/lib/auth-providers';

const OAUTH_LABELS: { id: AuthProviderId; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'discord', label: 'Discord' },
  { id: 'twitch', label: 'Twitch' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'microsoft', label: 'Microsoft' },
];

export function LoginPage() {
  const {
    loginProvider,
    loginEmail,
    registerEmail,
    requestPasswordReset,
    loginDev,
    isDevMode,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(true);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [oauth, setOauth] = useState<{
    google?: boolean;
    discord?: boolean;
    twitch?: boolean;
    tiktok?: boolean;
    microsoft?: boolean;
  } | null>(null);

  const oauthProviders = useMemo(
    () =>
      OAUTH_LABELS.map((p) => ({
        ...p,
        available:
          p.id === 'google'
            ? true
            : p.id === 'discord'
              ? oauth?.discord === true
              : p.id === 'twitch'
                ? oauth?.twitch === true
                : p.id === 'tiktok'
                  ? oauth?.tiktok === true
                  : p.id === 'microsoft'
                    ? oauth?.microsoft === true
                    : false,
      })),
    [oauth]
  );

  useEffect(() => {
    api.status()
      .then((status) => {
        setBackendOnline(true);
        setDevLoginEnabled(status.features.devLogin);
        setOauth(status.features.oauth ?? null);
      })
      .catch(() => setBackendOnline(false));

    api.auth
      .registrationStatus()
      .then((s) => {
        setInviteRequired(s.inviteRequired);
        setRegistrationOpen(s.registrationOpen);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('auth_error');
    if (stored) {
      setError(stored);
      sessionStorage.removeItem('auth_error');
    }
  }, []);

  function storePendingLegalAcceptance() {
    sessionStorage.setItem(
      'pending_legal_acceptance',
      JSON.stringify({
        termsVersion: LEGAL_TERMS_VERSION,
        privacyVersion: LEGAL_PRIVACY_VERSION,
      })
    );
  }

  function requireLegalAcceptance(): boolean {
    if (legalAccepted) {
      setLegalError(null);
      storePendingLegalAcceptance();
      return true;
    }
    setLegalError('Bitte akzeptiere die Nutzungsbedingungen und die Datenschutzerklärung.');
    return false;
  }

  async function handleOAuth(provider: AuthProviderId) {
    if (loading) return;
    const entry = oauthProviders.find((p) => p.id === provider);
    if (!entry?.available) {
      setError('Dieser Anmeldeanbieter ist derzeit nicht verfügbar.');
      return;
    }
    if (isRegister && !registrationOpen) {
      setError('Registrierung ist derzeit geschlossen');
      return;
    }
    if (isRegister && inviteRequired && !inviteCode.trim()) {
      setError('Einladungscode erforderlich');
      return;
    }
    if (isRegister && !requireLegalAcceptance()) {
      return;
    }
    if (inviteCode.trim()) {
      sessionStorage.setItem('pending_invite_code', inviteCode.trim());
    }
    setLoading(true);
    setError(null);
    try {
      await loginProvider(provider);
      navigate(from, { replace: true });
    } catch (err) {
      const msg = formatAuthError(err);
      if (msg.includes('Weiterleitung')) return;
      setError(msg);
      setLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (showReset) {
        await requestPasswordReset(email);
        setInfo('Falls ein Konto existiert, wurde eine Reset-E-Mail gesendet.');
        setShowReset(false);
        return;
      }
      if (isRegister) {
        if (!registrationOpen) {
          throw new Error('Registrierung ist derzeit geschlossen');
        }
        if (inviteRequired && !inviteCode.trim()) {
          throw new Error('Einladungscode erforderlich');
        }
        if (!requireLegalAcceptance()) {
          setLoading(false);
          return;
        }
        await registerEmail(email, password, inviteCode.trim() || undefined);
        setInfo('Konto erstellt. Bitte bestätige deine E-Mail-Adresse.');
      } else {
        await loginEmail(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDevLogin() {
    setLoading(true);
    setError(null);
    try {
      await loginDev();
      navigate(from, { replace: true });
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  const firebaseReady = isFirebaseConfigured();
  const showDevLogin = isDevMode || devLoginEnabled;
  const showFirebaseAuth = firebaseReady;

  return (
    <GlassCard accent="cyan" hover={false} className="!p-8">
      <CardTitle className="text-white">
        {showReset ? 'Passwort zurücksetzen' : isRegister ? 'Konto erstellen' : 'Willkommen zurück'}
      </CardTitle>
      <CardDescription>
        {backendOnline === false
          ? 'Backend offline — starte npm run dev im Projektordner'
          : showFirebaseAuth
            ? isRegister && inviteRequired
              ? 'Geschlossene Testphase — Einladungscode erforderlich.'
              : 'Melde dich an, um dein Branding fortzusetzen.'
            : 'Dev-Modus aktiv – Firebase nicht konfiguriert'}
      </CardDescription>

      {error && (
        <div
          id="login-auth-error"
          className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}
      {info && (
        <div
          id="login-auth-info"
          className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
          role="status"
          aria-live="polite"
        >
          {info}
        </div>
      )}

      {showDevLogin && !showFirebaseAuth ? (
        <div className="mt-6">
          <Button
            className="w-full"
            onClick={handleDevLogin}
            loading={loading}
            disabled={backendOnline === false}
          >
            Dev-Login (50 Coins Bonus)
          </Button>
        </div>
      ) : showFirebaseAuth ? (
        <>
          {isRegister && !showReset && (
            <div className="mt-6 space-y-1.5">
              <label className="flex items-start gap-3 text-sm text-zinc-300" htmlFor="register-legal">
                <input
                  id="register-legal"
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-surface-900 text-brand-500 focus:ring-2 focus:ring-brand-500"
                  checked={legalAccepted}
                  onChange={(e) => {
                    setLegalAccepted(e.target.checked);
                    if (e.target.checked) setLegalError(null);
                  }}
                  aria-invalid={legalError ? true : undefined}
                  aria-describedby={legalError ? 'register-legal-error' : 'register-legal-hint'}
                />
                <span>
                  Ich akzeptiere die{' '}
                  <Link to="/legal/agb" className="text-brand-400 underline underline-offset-2 hover:text-white">
                    Nutzungsbedingungen
                  </Link>{' '}
                  und habe die{' '}
                  <Link
                    to="/legal/datenschutz"
                    className="text-brand-400 underline underline-offset-2 hover:text-white"
                  >
                    Datenschutzerklärung
                  </Link>{' '}
                  gelesen.
                </span>
              </label>
              <p id="register-legal-hint" className="text-xs text-zinc-500">
                Die Texte sind Entwürfe und noch nicht rechtlich geprüft.
              </p>
              {legalError && (
                <p id="register-legal-error" className="text-xs text-red-400" role="alert">
                  {legalError}
                </p>
              )}
            </div>
          )}
          {!showReset && (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {oauthProviders.map((p) => (
                <button
                  key={p.id}
                  id={`oauth-login-${p.id}`}
                  type="button"
                  disabled={loading || !p.available || (isRegister && !registrationOpen)}
                  onClick={() => handleOAuth(p.id)}
                  aria-disabled={!p.available || loading}
                  aria-busy={loading || undefined}
                  aria-label={
                    p.available
                      ? `Mit ${p.label} anmelden`
                      : `${p.label} ist derzeit nicht verfügbar`
                  }
                  title={p.available ? `Mit ${p.label} anmelden` : `${p.label} ist derzeit nicht verfügbar`}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-surface-900 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {p.available ? p.label : `${p.label} (nicht verfügbar)`}
                </button>
              ))}
            </div>
          )}

          {!showReset && (
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-xs text-zinc-500">oder E-Mail</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleEmailSubmit}>
            <Input
              id="login-email"
              label="E-Mail"
              type="email"
              placeholder="creator@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              aria-describedby={error ? 'login-auth-error' : info ? 'login-auth-info' : undefined}
            />
            {!showReset && (
              <Input
                id="login-password"
                label="Passwort"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            )}
            {inviteRequired && !showReset && (
              <Input
                id="login-invite"
                label={isRegister ? 'Einladungscode' : 'Einladungscode (neue Konten)'}
                type="text"
                placeholder="z. B. TESTER01"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                required={isRegister && inviteRequired}
                autoComplete="off"
              />
            )}
            <Button className="w-full" type="submit" loading={loading}>
              {showReset ? 'Reset-Link senden' : isRegister ? 'Registrieren' : 'Anmelden'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-zinc-500">
            {showReset ? (
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="text-brand-400 hover:underline"
              >
                Zurück zur Anmeldung
              </button>
            ) : (
              <>
                {!isRegister && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowReset(true)}
                      className="text-brand-400 hover:underline"
                    >
                      Passwort vergessen?
                    </button>
                    <span className="mx-2 text-zinc-600">·</span>
                  </>
                )}
                {isRegister ? 'Bereits registriert?' : 'Noch kein Konto?'}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError(null);
                    setInfo(null);
                    setLegalError(null);
                    setLegalAccepted(false);
                  }}
                  className="text-brand-400 hover:underline"
                  disabled={!registrationOpen && !isRegister}
                >
                  {isRegister ? 'Anmelden' : registrationOpen ? 'Registrieren' : 'Geschlossen'}
                </button>
              </>
            )}
          </p>

          {showDevLogin && (
            <div className="mt-6 border-t border-zinc-800 pt-4">
              <Button
                variant="ghost"
                className="w-full text-zinc-400"
                onClick={handleDevLogin}
                loading={loading}
                disabled={backendOnline === false}
              >
                Dev-Login (50 Coins Bonus)
              </Button>
            </div>
          )}
        </>
      ) : null}
    </GlassCard>
  );
}
