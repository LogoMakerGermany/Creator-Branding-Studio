import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AUTH_GATE_PATH, resolveAuthGate } from '@/lib/auth-gates';
import { formatAuthError } from '@/lib/auth-errors';
import { reloadCurrentUserAndToken, resendEmailVerification } from '@/lib/firebase';
import { api } from '@/services/api';
import { Button } from '@/components/ui';
import { LegalFooter } from '@/components/legal/LegalFooter';

const RESEND_COOLDOWN_MS = 60_000;
const RESEND_AT_KEY = 'nexter-verify-resend-at';

function remainingCooldown(): number {
  const raw = sessionStorage.getItem(RESEND_AT_KEY);
  const at = raw ? Number(raw) : 0;
  if (!Number.isFinite(at) || at <= 0) return 0;
  return Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - at));
}

export function VerifyEmailPage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const gate = resolveAuthGate(user);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(remainingCooldown);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown(remainingCooldown()), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <span className="sr-only">Anmeldung wird geprüft</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (gate !== 'verify-email') {
    return <Navigate to={AUTH_GATE_PATH[gate]} replace />;
  }

  async function handleConfirmed() {
    setChecking(true);
    setError(null);
    setStatus(null);
    try {
      await reloadCurrentUserAndToken();
      await refreshUser();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setChecking(false);
    }
  }

  async function handleResend() {
    if (sending || remainingCooldown() > 0) {
      setCooldown(remainingCooldown());
      return;
    }
    setSending(true);
    setError(null);
    setStatus(null);
    try {
      await api.auth.requestVerificationResend();
      await resendEmailVerification();
      sessionStorage.setItem(RESEND_AT_KEY, String(Date.now()));
      setCooldown(RESEND_COOLDOWN_MS);
      setStatus('Falls nötig, wurde eine neue Bestätigungs-Mail gesendet. Prüfe auch den Spam-Ordner.');
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSending(false);
    }
  }

  const waitSec = Math.ceil(cooldown / 1000);

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-8">
      <h1 className="font-display text-3xl font-bold text-white">E-Mail bestätigen</h1>
      <p className="break-words text-sm text-zinc-300">
        Wir haben eine Bestätigungs-Mail an <strong className="text-white">{user.email}</strong> gesendet.
        Bestätige zuerst deine E-Mail-Adresse. Studios, Coins und Nexter-Aktionen bleiben bis dahin gesperrt.
      </p>
      <p className="text-sm text-zinc-400">
        Öffne den Link in der Mail, komm dann hierher zurück und tippe auf „Ich habe meine E-Mail bestätigt“.
        Falls die Adresse falsch ist, melde dich ab — eine E-Mail-Änderung ist hier nicht verfügbar.
      </p>
      {status && (
        <p
          id="verify-email-status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      )}
      {error && (
        <p
          id="verify-email-error"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="min-h-11" loading={checking} disabled={sending} onClick={() => void handleConfirmed()}>
          Ich habe meine E-Mail bestätigt
        </Button>
        <Button
          variant="secondary"
          className="min-h-11"
          loading={sending}
          disabled={waitSec > 0 || checking}
          onClick={() => void handleResend()}
        >
          {waitSec > 0 ? `Erneut senden (${waitSec}s)` : 'Mail erneut senden'}
        </Button>
        <Button variant="ghost" className="min-h-11" disabled={checking || sending} onClick={() => void logout()}>
          Abmelden
        </Button>
      </div>
      <LegalFooter />
    </div>
  );
}
