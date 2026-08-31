import { isDevMode, isProduction, getDefaultFreeCoins } from '../config/env.js';
import { dsGet, dsSet } from '../lib/data-store.js';

export type EmailKind =
  | 'welcome'
  | 'verify'
  | 'password-reset'
  | 'purchase'
  | 'invoice'
  | 'coins'
  | 'invite'
  | 'warning';

export interface EmailPayload {
  to: string;
  kind: EmailKind;
  subject: string;
  text: string;
}

const DISPATCH_COLLECTION = 'email_dispatches';

export interface DispatchResult {
  sent: boolean;
  duplicate: boolean;
  provider: string;
}

/**
 * Send is a side effect. Callers must not roll back money on failure.
 */
export async function sendTransactionalEmail(
  payload: EmailPayload
): Promise<{ sent: boolean; provider: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (key) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || 'NEXTER <noreply@nexter.studio>',
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`E-Mail fehlgeschlagen (${res.status})`);
    }
    return { sent: true, provider: 'resend' };
  }

  if (isProduction()) {
    console.error('[email] RESEND_API_KEY fehlt — Versand übersprungen');
    return { sent: false, provider: 'none' };
  }

  if (isDevMode()) {
    console.info(`[email:dev] ${payload.kind} → ${payload.to}: ${payload.subject}`);
    return { sent: true, provider: 'log' };
  }

  return { sent: false, provider: 'none' };
}

export async function dispatchTransactionalEmail(
  idempotencyKey: string,
  payload: EmailPayload
): Promise<DispatchResult> {
  const existing = await dsGet(DISPATCH_COLLECTION, idempotencyKey);
  if (existing?.sentAt) {
    return { sent: false, duplicate: true, provider: String(existing.provider ?? 'none') };
  }

  try {
    const result = await sendTransactionalEmail(payload);
    if (result.sent) {
      await dsSet(DISPATCH_COLLECTION, idempotencyKey, {
        id: idempotencyKey,
        kind: payload.kind,
        to: payload.to,
        provider: result.provider,
        sentAt: new Date().toISOString(),
      });
    }
    return { sent: result.sent, duplicate: false, provider: result.provider };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'email failed';
    console.error('[email] send failed:', message);
    return { sent: false, duplicate: false, provider: 'error' };
  }
}

export function welcomeEmail(to: string, name: string, coins = getDefaultFreeCoins()): EmailPayload {
  return {
    to,
    kind: 'welcome',
    subject: 'Willkommen bei NEXTER Creator Studio',
    text: `Hallo ${name},\n\ndu bist bei NEXTER Creator Studio. Startguthaben: ${coins} Coins.\n\n— NEXTER`,
  };
}

export function inviteEmail(to: string, code: string, description: string): EmailPayload {
  return {
    to,
    kind: 'invite',
    subject: 'Deine NEXTER-Einladung',
    text: `Hallo,\n\ndu wurdest zu NEXTER Creator Studio eingeladen.\nCode: ${code}\n${description}\n\n— NEXTER`,
  };
}

export function purchaseReceiptEmail(
  to: string,
  name: string,
  packageName: string,
  coins: number
): EmailPayload {
  return {
    to,
    kind: 'purchase',
    subject: `NEXTER: ${packageName} gutgeschrieben`,
    text: `Hallo ${name},\n\n${coins} Coins (${packageName}) wurden deinem Konto gutgeschrieben.\n\n— NEXTER`,
  };
}
