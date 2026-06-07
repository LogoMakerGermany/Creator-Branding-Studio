import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/');
      } else if (mode === 'register') {
        await register(email, name, password);
        navigate('/');
      } else {
        await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email }),
        });
        setMessage('E-Mail simuliert – Passwort-Reset gesendet (Mock).');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Fehler';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard className="w-full max-w-md" glow="pink">
      <h1 className="font-display text-2xl font-bold text-gradient text-center">Creator Branding Studio</h1>
      <p className="mt-2 text-center text-sm text-white/50">Premium Brand DNA für Creator</p>

      <div className="mt-6 flex gap-2">
        {(['login', 'register', 'reset'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-2 text-xs capitalize ${mode === m ? 'bg-neon-pink/20 text-neon-pink' : 'text-white/40'}`}>
            {m === 'login' ? 'Login' : m === 'register' ? 'Registrierung' : 'Reset'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === 'register' && (
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" required
            className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-3 outline-none focus:border-neon-cyan" />
        )}
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail" required
          className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-3 outline-none focus:border-neon-cyan" />
        {mode !== 'reset' && (
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort (min. 4 Zeichen)" required minLength={4}
            className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-3 outline-none focus:border-neon-cyan" />
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-neon-cyan">{message}</p>}
        <NeonButton type="submit" loading={loading} className="w-full">
          {mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Registrieren' : 'Reset senden'}
        </NeonButton>
      </form>

      {mode === 'login' && (
        <div className="mt-4 rounded-lg bg-white/5 p-3 text-xs text-white/40">
          <p>Demo-Zugänge:</p>
          <p>admin@cbs.local / mod@cbs.local / user@cbs.local / tester@cbs.local</p>
          <p>Beliebiges Passwort (min. 4 Zeichen)</p>
        </div>
      )}
    </GlassCard>
  );
}
