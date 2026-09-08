import { isDevMode, isProduction, getDefaultFreeCoins, getResendApiKey, getEmailFrom } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
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

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

function sanitizeEmailTextField(value: string, max = 80): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Send is a side effect. Callers must not roll back money on failure.
 * Tests never call a real provider.
 */
export async function sendTransactionalEmail(
  payload: EmailPayload
): Promise<{ sent: boolean; provider: string }> {
  if (isPaidProviderTestBlocked()) {
    return { sent: true, provider: 'test' };
  }

  const key = getResendApiKey();
  const from = getEmailFrom();
  if (key && from) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`E-Mail fehlgeschlagen (${res.status})`);
    }
    return { sent: true, provider: 'resend' };
  }

  if (isProduction()) {
    console.error('[email] custom provider not configured — Versand übersprungen');
    return { sent: false, provider: 'none' };
  }

  if (isDevMode()) {
    console.info(`[email:dev] ${payload.kind} → ${maskEmailAddress(payload.to)}: ${payload.subject}`);
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
    console.error('[email] send failed:', message.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '***'));
    return { sent: false, duplicate: false, provider: 'error' };
  }
}

export function welcomeEmail(to: string, name: string, coins = getDefaultFreeCoins()): EmailPayload {
  return {
    to,
    kind: 'welcome',
    subject: 'Willkommen bei NEXTER Creator Studio',
    text: `Hallo ${sanitizeEmailTextField(name)},\n\ndu bist bei NEXTER Creator Studio. Startguthaben: ${coins} Coins.\n\n— NEXTER`,
  };
}

export function inviteEmail(to: string, code: string, description: string): EmailPayload {
  return {
    to,
    kind: 'invite',
    subject: 'Deine NEXTER-Einladung',
    text: `Hallo,\n\ndu wurdest zu NEXTER Creator Studio eingeladen.\nCode: ${sanitizeEmailTextField(code, 64)}\n${sanitizeEmailTextField(description, 200)}\n\n— NEXTER`,
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
    subject: `NEXTER: ${sanitizeEmailTextField(packageName, 80)} gutgeschrieben`,
    text: `Hallo ${sanitizeEmailTextField(name)},\n\n${coins} Coins (${sanitizeEmailTextField(packageName, 80)}) wurden deinem Konto gutgeschrieben.\n\n— NEXTER`,
  };
}
