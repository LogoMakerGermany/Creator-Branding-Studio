import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Input, CardTitle, CardDescription } from '@/components/ui';
import { GlassCard } from '@/v2/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import { formatAuthError } from '@/lib/auth-errors';
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
  const { loginProvider, loginEmail, registerEmail, loginDev, isDevMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('auth_error');
    if (stored) {
      setError(stored);
      sessionStorage.removeItem('auth_error');
    }
  }, []);

  async function handleOAuth(provider: AuthProviderId) {
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
    try {
      if (isRegister) {
        await registerEmail(email, password);
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

  return (
    <GlassCard accent="cyan" hover={false} className="!p-8">
      <CardTitle className="text-white">{isRegister ? 'Konto erstellen' : 'Willkommen zurück'}</CardTitle>
      <CardDescription>
        {isDevMode
          ? 'Dev-Modus aktiv – Firebase nicht konfiguriert'
          : 'Melde dich an, um dein Branding fortzusetzen.'}
      </CardDescription>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isDevMode ? (
        <div className="mt-6">
          <Button className="w-full" onClick={handleDevLogin} loading={loading}>
            Dev-Login (50 Coins Bonus)
          </Button>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Für Produktion: Firebase Keys setzen (npm run sync:firebase-env)
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {OAUTH_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={loading}
                onClick={() => handleOAuth(p.id)}
                className={`flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-surface-900 py-2.5 text-sm font-medium text-zinc-200 transition-colors disabled:opacity-50 ${p.color}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {firebaseReady && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs text-zinc-500">oder E-Mail</span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>

              <form className="space-y-4" onSubmit={handleEmailSubmit}>
                <Input
                  label="E-Mail"
                  type="email"
                  placeholder="creator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="Passwort"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Button className="w-full" type="submit" loading={loading}>
                  {isRegister ? 'Registrieren' : 'Anmelden'}
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-zinc-500">
                {isRegister ? 'Bereits registriert?' : 'Noch kein Konto?'}{' '}
                <button
                  type="button"
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-brand-400 hover:underline"
                >
                  {isRegister ? 'Anmelden' : 'Registrieren'}
                </button>
              </p>
            </>
          )}
        </>
      )}
    </GlassCard>
  );
}
