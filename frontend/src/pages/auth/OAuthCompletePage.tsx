import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AUTH_GATE_PATH, resolveAuthGate } from '@/lib/auth-gates';
import { formatAuthError } from '@/lib/auth-errors';
import { completeOAuthCustomToken } from '@/lib/firebase';
import { api } from '@/services/api';
import { GlassCard } from '@/v2/components/GlassCard';
import { CardTitle, CardDescription } from '@/components/ui';

const PENDING_INVITE_KEY = 'pending_invite_code';
const PENDING_LEGAL_KEY = 'pending_legal_acceptance';
const PENDING_OAUTH_PROVIDER_KEY = 'pending_oauth_provider';

type OAuthCompleteResult = {
  customToken: string;
  provider: 'discord' | 'twitch' | 'tiktok';
  inviteCode?: string;
  legalAcceptance?: { termsVersion: string; privacyVersion: string };
};

const ticketRequests = new Map<string, Promise<OAuthCompleteResult>>();

function completeOAuthOnce(ticket: string): Promise<OAuthCompleteResult> {
  const existing = ticketRequests.get(ticket);
  if (existing) return existing;
  const request = api.auth.completeOAuth(ticket).catch((err) => {
    ticketRequests.delete(ticket);
    throw err;
  });
  ticketRequests.set(ticket, request);
  return request;
}

function mapOAuthQueryError(code: string): { code: string; message: string } {
  switch (code) {
    case 'cancelled':
      return { code: 'OAUTH_CANCELLED', message: 'Anmeldung abgebrochen.' };
    case 'account_collision':
      return { code: 'ACCOUNT_COLLISION', message: '' };
    case 'link_conflict':
      return { code: 'OAUTH_LINK_CONFLICT', message: '' };
    case 'not_configured':
      return { code: 'OAUTH_NOT_CONFIGURED', message: '' };
    case 'invalid_code':
      return { code: 'OAUTH_FAILED', message: 'Anmeldung beim Anbieter fehlgeschlagen.' };
    case 'expired':
    case 'replay':
    case 'invalid_callback':
    case 'invalid_state':
      return { code: 'OAUTH_TICKET_INVALID', message: '' };
    default:
      return { code: 'OAUTH_FAILED', message: 'Anmeldung beim Anbieter fehlgeschlagen.' };
  }
}

export function OAuthCompletePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [working, setWorking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryError = searchParams.get('oauth_error');
    if (queryError) {
      sessionStorage.setItem('auth_error', formatAuthError(mapOAuthQueryError(queryError)));
      navigate('/login', { replace: true });
      return;
    }

    const ticket = searchParams.get('ticket');
    if (!ticket) {
      sessionStorage.setItem('auth_error', formatAuthError({ code: 'OAUTH_TICKET_INVALID' }));
      navigate('/login', { replace: true });
      return;
    }

    void (async () => {
      try {
        const result = await completeOAuthOnce(ticket);
        if (result.inviteCode) {
          sessionStorage.setItem(PENDING_INVITE_KEY, result.inviteCode);
        }
        if (result.legalAcceptance) {
          sessionStorage.setItem(PENDING_LEGAL_KEY, JSON.stringify(result.legalAcceptance));
        }
        sessionStorage.setItem(PENDING_OAUTH_PROVIDER_KEY, result.provider);
        await completeOAuthCustomToken(result.customToken);
        setWorking(false);
      } catch (err) {
        const msg = formatAuthError(err);
        sessionStorage.setItem('auth_error', msg);
        setError(msg);
        setWorking(false);
        navigate('/login', { replace: true });
      }
    })();
  }, [navigate, searchParams]);

  useEffect(() => {
    if (working || loading) return;
    if (user) {
      navigate(AUTH_GATE_PATH[resolveAuthGate(user)], { replace: true });
      return;
    }
    if (sessionStorage.getItem('auth_error')) {
      navigate('/login', { replace: true });
    }
  }, [loading, navigate, user, working]);

  return (
    <GlassCard accent="cyan" hover={false} className="!p-8">
      <CardTitle className="text-white">Anmeldung wird abgeschlossen</CardTitle>
      <CardDescription>
        {error || 'Einen Moment — wir verbinden dein Konto.'}
      </CardDescription>
    </GlassCard>
  );
}
