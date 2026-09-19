/**
 * Fail-closed mailbox parsing for transactional email.
 * Does not invent domains or merge legal/support addresses.
 */

const HEADER_INJECTION = /[\r\n\0]/;
const MAILBOX_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
const RETIRED_APP_HOST = 'creatorbrandingstudioultimate-production.up.railway.app';

/** Public mailbox and Resend test domains are not valid production From/Reply-To. */
const PRODUCTION_FORBIDDEN_FROM_DOMAINS = new Set([
  'resend.dev',
  'localhost',
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'railway.app',
]);

export interface ParsedMailbox {
  formatted: string;
  email: string;
  domain: string;
  displayName?: string;
}

export function hasHeaderInjection(value: string): boolean {
  return HEADER_INJECTION.test(value);
}

export function normalizeRecipientEmail(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  if (hasHeaderInjection(trimmed) || /[<>]/.test(trimmed) || /\s/.test(trimmed)) return null;
  if (!MAILBOX_RE.test(trimmed)) return null;
  return trimmed;
}

export function parseFromAddress(raw: string | undefined | null): ParsedMailbox | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 180 || hasHeaderInjection(trimmed)) return null;

  const named = trimmed.match(/^([^<>]{1,80})\s*<([^<>]+)>$/);
  const emailRaw = named ? named[2].trim() : trimmed;
  const displayName = named ? named[1].trim() : undefined;
  if (displayName !== undefined && (!displayName || hasHeaderInjection(displayName) || /[<>]/.test(displayName))) {
    return null;
  }
  if (/[<>]/.test(emailRaw) || hasHeaderInjection(emailRaw)) return null;
  const email = emailRaw.toLowerCase();
  if (!MAILBOX_RE.test(email)) return null;
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (!domain) return null;
  const formatted = displayName ? `${displayName} <${email}>` : email;
  return { formatted, email, domain, displayName };
}

export function isAllowedTransactionalFrom(parsed: ParsedMailbox | null, production: boolean): boolean {
  if (!parsed) return false;
  if (!production) return true;
  if (
    parsed.domain === 'localhost' ||
    parsed.domain.endsWith('.localhost') ||
    parsed.domain.endsWith('.local') ||
    parsed.domain.endsWith('.invalid')
  ) {
    return false;
  }
  if (PRODUCTION_FORBIDDEN_FROM_DOMAINS.has(parsed.domain)) return false;
  return true;
}

export function isSafeTransactionalSubject(subject: string): boolean {
  return Boolean(subject.trim()) && !hasHeaderInjection(subject) && subject.length <= 200;
}

export function transactionalAppUrl(raw: string | undefined, production: boolean): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !production)) return null;
    if (production && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return null;
    if (host === RETIRED_APP_HOST) return null;
    return url.origin;
  } catch {
    return null;
  }
}
