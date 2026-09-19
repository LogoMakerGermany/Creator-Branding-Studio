import type { InviteCode } from '@ucbs/shared';
import {
  isDevMode,
  isProduction,
  getDefaultFreeCoins,
  getResendApiKey,
  getTransactionalFromAddress,
  getEmailReplyTo,
  getTransactionalAppUrl,
  isTransactionalEmailConfigured,
} from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import {
  isSafeTransactionalSubject,
  normalizeRecipientEmail,
} from '../lib/email-address.js';
import { dsGet, dsSet } from '../lib/data-store.js';
import { withDevLock } from '../lib/dev-mutex.js';

export type EmailKind =
  | 'welcome'
  | 'verify'
  | 'password-reset'
  | 'purchase'
  | 'invoice'
  | 'coins'
  | 'invite'
  | 'warning';

export type EmailFailureReason = 'not_configured' | 'provider_error';

export type EmailDeliveryStatus =
  | 'not_attempted'
  | 'skipped'
  | 'sent'
  | 'failed'
  | 'not_configured'
  | 'duplicate';

export interface EmailPayload {
  to: string;
  kind: EmailKind;
  subject: string;
  text: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: string;
  reason?: EmailFailureReason;
  providerMessageId?: string;
}

export interface DispatchResult {
  sent: boolean;
  duplicate: boolean;
  provider: string;
  reason?: EmailFailureReason;
  status: EmailDeliveryStatus;
  providerMessageId?: string;
}

export interface InviteEmailDelivery {
  attempted: boolean;
  sent: boolean;
  duplicate: boolean;
  status: EmailDeliveryStatus;
  message: string;
}

export const INVITE_CREATED_MESSAGE = 'Einladung erstellt.';
export const INVITE_CREATED_AND_SENT_MESSAGE = 'Einladung erstellt und E-Mail versendet.';
export const INVITE_CREATED_EMAIL_FAILED_MESSAGE =
  'Die Einladung wurde erstellt, aber die E-Mail konnte momentan nicht versendet werden.';
export const EMAIL_NOT_SENT_MESSAGE =
  'Die E-Mail konnte momentan nicht versendet werden. Bitte versuche es später erneut.';
export const EMAIL_ALREADY_SENT_MESSAGE = 'Die E-Mail wurde bereits versendet.';
export const EMAIL_SENT_MESSAGE = 'Die E-Mail wurde versendet.';
export const EMAIL_NOT_APPLICABLE_MESSAGE = 'Diese Einladung hat keine zugewiesene E-Mail-Adresse.';

const DISPATCH_COLLECTION = 'email_dispatches';

type EmailTransport = (payload: EmailPayload) => Promise<SendEmailResult>;

let testTransport: EmailTransport | null = null;

export function setTestEmailTransport(transport: EmailTransport | null): void {
  testTransport = transport;
}

export function resetTestEmailTransport(): void {
  testTransport = null;
}

export function inviteEmailIdempotencyKey(inviteId: string): string {
  return `invite:${inviteId}`;
}

export function welcomeEmailIdempotencyKey(uid: string): string {
  return `welcome:${uid}`;
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
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function redactLogText(message: string): string {
  return message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '***')
    .replace(/\bre_[A-Za-z0-9]+\b/g, 're_***')
    .replace(/RESEND_API_KEY|EMAIL_FROM|EMAIL_REPLY_TO/g, 'ENV');
}

function logDeliveryIssue(kind: EmailKind, reason: EmailFailureReason | 'error', provider?: string): void {
  console.error('[email] delivery failed', { kind, reason, provider: provider || 'none' });
}

function assertSendPayload(payload: EmailPayload): EmailFailureReason | null {
  if (!normalizeRecipientEmail(payload.to)) return 'provider_error';
  if (!isSafeTransactionalSubject(payload.subject)) return 'provider_error';
  return null;
}

/**
 * Send is a side effect. Callers must not roll back money or accounts on failure.
 * Tests never call a real provider. From/reply-to come only from server env.
 */
export async function sendTransactionalEmail(
  payload: EmailPayload,
  options?: { idempotencyKey?: string }
): Promise<SendEmailResult> {
  const invalid = assertSendPayload(payload);
  if (invalid) {
    logDeliveryIssue(payload.kind, invalid, 'none');
    return { sent: false, provider: 'none', reason: invalid };
  }

  if (isPaidProviderTestBlocked()) {
    if (testTransport) return testTransport(payload);
    if (isTransactionalEmailConfigured()) {
      return { sent: true, provider: 'test' };
    }
    logDeliveryIssue(payload.kind, 'not_configured', 'none');
    return { sent: false, provider: 'none', reason: 'not_configured' };
  }

  const key = getResendApiKey();
  const from = getTransactionalFromAddress();
  if (key && from && isTransactionalEmailConfigured()) {
    const to = normalizeRecipientEmail(payload.to)!;
    const body: Record<string, unknown> = {
      from,
      to: [to],
      subject: payload.subject,
      text: payload.text,
    };
    const replyTo = getEmailReplyTo();
    if (replyTo) body.reply_to = [replyTo];

    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    const idempotencyKey = options?.idempotencyKey?.trim().slice(0, 256);
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`E-Mail fehlgeschlagen (${res.status})`);
    }
    let providerMessageId: string | undefined;
    try {
      const json = (await res.json()) as { id?: unknown };
      if (typeof json.id === 'string' && json.id.trim()) providerMessageId = json.id.trim();
    } catch {
      providerMessageId = undefined;
    }
    return { sent: true, provider: 'resend', providerMessageId };
  }

  if (isProduction()) {
    logDeliveryIssue(payload.kind, 'not_configured', 'none');
    return { sent: false, provider: 'none', reason: 'not_configured' };
  }

  if (isDevMode()) {
    console.info(`[email:dev] ${payload.kind} → ${maskEmailAddress(payload.to)}: ${payload.subject}`);
    return { sent: true, provider: 'log' };
  }

  logDeliveryIssue(payload.kind, 'not_configured', 'none');
  return { sent: false, provider: 'none', reason: 'not_configured' };
}

function emailDispatchLockKey(idempotencyKey: string): string {
  return `email-dispatch:${idempotencyKey}`;
}

export async function getEmailDispatch(idempotencyKey: string): Promise<Record<string, unknown> | null> {
  const row = await dsGet(DISPATCH_COLLECTION, idempotencyKey);
  return row;
}

export async function dispatchTransactionalEmail(
  idempotencyKey: string,
  payload: EmailPayload
): Promise<DispatchResult> {
  return withDevLock(emailDispatchLockKey(idempotencyKey), async () => {
    const existing = await dsGet(DISPATCH_COLLECTION, idempotencyKey);
    if (existing?.sentAt) {
      return {
        sent: false,
        duplicate: true,
        provider: String(existing.provider ?? 'none'),
        status: 'duplicate' as const,
      };
    }

    try {
      const result = await sendTransactionalEmail(payload, { idempotencyKey });
      if (result.sent) {
        await dsSet(DISPATCH_COLLECTION, idempotencyKey, {
          id: idempotencyKey,
          kind: payload.kind,
          toMasked: maskEmailAddress(payload.to),
          provider: result.provider,
          status: 'sent',
          sentAt: new Date().toISOString(),
          ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        });
        return {
          sent: true,
          duplicate: false,
          provider: result.provider,
          status: 'sent',
          providerMessageId: result.providerMessageId,
        };
      }
      const reason = result.reason || 'provider_error';
      await dsSet(DISPATCH_COLLECTION, idempotencyKey, {
        id: idempotencyKey,
        kind: payload.kind,
        provider: result.provider,
        status: reason === 'not_configured' ? 'not_configured' : 'failed',
        failedAt: new Date().toISOString(),
        reason,
      });
      return {
        sent: false,
        duplicate: false,
        provider: result.provider,
        reason,
        status: reason === 'not_configured' ? 'not_configured' : 'failed',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'email failed';
      console.error('[email] send failed:', redactLogText(message));
      logDeliveryIssue(payload.kind, 'provider_error', 'error');
      await dsSet(DISPATCH_COLLECTION, idempotencyKey, {
        id: idempotencyKey,
        kind: payload.kind,
        provider: 'error',
        status: 'failed',
        failedAt: new Date().toISOString(),
        reason: 'provider_error',
      }).catch(() => undefined);
      return {
        sent: false,
        duplicate: false,
        provider: 'error',
        reason: 'provider_error',
        status: 'failed',
      };
    }
  });
}

function appUrlLine(): string {
  const url = getTransactionalAppUrl();
  return url ? `\n\n${url}` : '';
}

export function welcomeEmail(to: string, name: string, coins = getDefaultFreeCoins()): EmailPayload {
  return {
    to,
    kind: 'welcome',
    subject: 'Willkommen bei NEXTER Creator Studio',
    text: `Hallo ${sanitizeEmailTextField(name)},\n\ndu bist bei NEXTER Creator Studio. Startguthaben: ${coins} Coins.${appUrlLine()}\n\n— NEXTER`,
  };
}

export function inviteEmail(to: string, code: string, description: string): EmailPayload {
  return {
    to,
    kind: 'invite',
    subject: 'Deine NEXTER-Einladung',
    text: `Hallo,\n\ndu wurdest zu NEXTER Creator Studio eingeladen.\nCode: ${sanitizeEmailTextField(code, 64)}\n${sanitizeEmailTextField(description, 200)}${appUrlLine()}\n\n— NEXTER`,
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
    text: `Hallo ${sanitizeEmailTextField(name)},\n\n${coins} Coins (${sanitizeEmailTextField(packageName, 80)}) wurden deinem Konto gutgeschrieben.${appUrlLine()}\n\n— NEXTER`,
  };
}

function inviteDeliveryMessage(
  status: EmailDeliveryStatus,
  created: boolean
): string {
  if (status === 'skipped' || status === 'not_attempted') {
    return created ? INVITE_CREATED_MESSAGE : EMAIL_NOT_APPLICABLE_MESSAGE;
  }
  if (status === 'sent') {
    return created ? INVITE_CREATED_AND_SENT_MESSAGE : EMAIL_SENT_MESSAGE;
  }
  if (status === 'duplicate') {
    return created ? INVITE_CREATED_AND_SENT_MESSAGE : EMAIL_ALREADY_SENT_MESSAGE;
  }
  return created ? INVITE_CREATED_EMAIL_FAILED_MESSAGE : EMAIL_NOT_SENT_MESSAGE;
}

export async function deliverAssignedInviteEmail(
  invite: InviteCode,
  options?: { created?: boolean }
): Promise<InviteEmailDelivery> {
  const created = options?.created === true;
  if (!invite.assignedEmail) {
    return {
      attempted: false,
      sent: false,
      duplicate: false,
      status: 'skipped',
      message: inviteDeliveryMessage('skipped', created),
    };
  }

  const result = await dispatchTransactionalEmail(
    inviteEmailIdempotencyKey(invite.id),
    inviteEmail(invite.assignedEmail, invite.code, invite.description)
  );
  return {
    attempted: true,
    sent: result.sent,
    duplicate: result.duplicate,
    status: result.status,
    message: inviteDeliveryMessage(result.status, created),
  };
}

export async function inviteEmailDeliveryFromStore(invite: InviteCode): Promise<{
  status: EmailDeliveryStatus;
  sent: boolean;
}> {
  if (!invite.assignedEmail) {
    return { status: 'skipped', sent: false };
  }
  const row = await getEmailDispatch(inviteEmailIdempotencyKey(invite.id));
  if (!row) return { status: 'not_attempted', sent: false };
  if (row.sentAt) return { status: 'sent', sent: true };
  if (row.status === 'not_configured') return { status: 'not_configured', sent: false };
  return { status: 'failed', sent: false };
}
