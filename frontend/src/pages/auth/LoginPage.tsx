import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Input, CardTitle, CardDescription } from '@/components/ui';
import { GlassCard } from '@/v2/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import { formatAuthError } from '@/lib/auth-errors';
import { api } from '@/services/api';
import type { AuthProviderId } from '@/lib/auth-providers';

const OAUTH_PROVIDERS: { id: AuthProviderId; label: string; color: string }[] = [
  { id: 'google', label: 'Google', color: 'hover:bg-white/10' },
  { id: 'github', label: 'GitHub', color: 'hover:bg-zinc-500/20' },
  { id: 'apple', label: 'Apple', color: 'hover:bg-zinc-600/20' },
  { id: 'microsoft', label: 'Microsoft', color: 'hover:bg-blue-500/20' },
  { id: 'discord', label: 'Discord', color: 'hover:bg-indigo-500/20' },
  { id: 'twitch', label: 'Twitch', color: 'hover:bg-purple-500/20' },
  { id: 'tiktok', label: 'TikTok', color: 'hover:bg-pink-500/20' },
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

  useEffect(() => {
    api.status()
      .then((status) => {
        setBackendOnline(true);
        setDevLoginEnabled(status.features.devLogin);
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

  async function handleOAuth(provider: AuthProviderId) {
    if (isRegister && !registrationOpen) {
      setError('Registrierung ist derzeit geschlossen');
      return;
    }
    if (isRegister && inviteRequired && !inviteCode.trim()) {
      setError('Einladungscode erforderlich');
      return;
    }
    if (isRegister && inviteCode.trim()) {
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
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {info && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
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
          {!showReset && (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {OAUTH_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={loading || (isRegister && !registrationOpen)}
                  onClick={() => handleOAuth(p.id)}
                  className={`flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-surface-900 py-2.5 text-sm font-medium text-zinc-200 transition-colors disabled:opacity-50 ${p.color}`}
                >
                  {p.label}
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
              label="E-Mail"
              type="email"
              placeholder="creator@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {!showReset && (
              <Input
                label="Passwort"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            )}
            {isRegister && !showReset && (inviteRequired || inviteCode) && (
              <Input
                label="Einladungscode"
                type="text"
                placeholder="z. B. TESTER01"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                required={inviteRequired}
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
