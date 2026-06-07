import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';

const MIN_PASSWORD_LENGTH = 8;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register, resetPassword, checkAuthConfig, authReady, authError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);

  useEffect(() => {
    checkAuthConfig().finally(() => setCheckingConfig(false));
  }, [checkAuthConfig]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authReady) return;

    setLoading(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/');
      } else if (mode === 'register') {
        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
        }
        await register(email, name, password);
        navigate('/');
      } else {
        await resetPassword(email);
        setMessage('Falls ein Konto existiert, wurde ein Link zum Zurücksetzen an deine E-Mail gesendet.');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = axiosErr.response?.data?.error || axiosErr.message || 'Anmeldung fehlgeschlagen';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: typeof mode; label: string }[] = [
    { id: 'login', label: 'Login' },
    { id: 'register', label: 'Registrieren' },
    { id: 'reset', label: 'Passwort vergessen' },
  ];

  return (
    <GlassCard className="w-full max-w-md" glow="pink">
      <h1 className="text-center font-display text-2xl font-bold text-gradient">Creator Branding Studio</h1>
      <p className="mt-2 text-center text-sm text-white/50">Melde dich mit deinem Konto an</p>

      {checkingConfig && (
        <p className="mt-6 text-center text-sm text-white/50">Auth wird geprüft…</p>
      )}

      {!checkingConfig && authError && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <p className="font-semibold">Anmeldung nicht verfügbar</p>
          <p className="mt-2">{authError}</p>
          <p className="mt-2 text-xs text-red-300/80">Es gibt keinen Demo- oder Test-Login. Firebase Auth muss konfiguriert sein.</p>
        </div>
      )}

      {!checkingConfig && authReady && (
        <>
          <div className="mt-6 flex gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setMode(tab.id); setError(''); setMessage(''); }}
                className={`flex-1 rounded-lg py-2 text-xs ${mode === tab.id ? 'bg-neon-pink/20 text-neon-pink' : 'text-white/40'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Dein Name"
                required
                className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-3 outline-none focus:border-neon-cyan"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-Mail"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-3 outline-none focus:border-neon-cyan"
            />
            {mode !== 'reset' && (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={`Passwort (min. ${MIN_PASSWORD_LENGTH} Zeichen)`}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-3 outline-none focus:border-neon-cyan"
              />
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {message && <p className="text-sm text-neon-cyan">{message}</p>}
            <NeonButton type="submit" loading={loading} className="w-full">
              {mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Link senden'}
            </NeonButton>
          </form>
        </>
      )}
    </GlassCard>
  );
}
