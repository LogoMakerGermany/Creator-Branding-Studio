import { randomUUID } from 'node:crypto';
import { isProduction } from '../config/env.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REQUEST_ID_RE = /^[a-zA-Z0-9._-]{8,64}$/;
const SLOW_REQUEST_MS = 8_000;
const SECRET_KEY_NAME =
  /password|passwd|secret|authorization|cookie|api[_-]?key|private[_-]?key|refresh[_-]?token|id[_-]?token|action[_-]?code|oobcode|service[_-]?account/i;
const SECRET_VALUE =
  /BEGIN PRIVATE KEY|sk_live|sk_test|whsec_|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9._-]{12,}|re_[A-Za-z0-9]{10,}/;
const SIGNED_URL_HINT = /X-Goog-Signature|GoogleAccessId|X-Amz-Signature/i;
const JWT_HINT = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./;

export interface StructuredLog {
  level: LogLevel;
  ts: string;
  event: string;
  requestId?: string;
  method?: string;
  route?: string;
  status?: number;
  code?: string;
  durationMs?: number;
  message?: string;
}

export function isSafeClientRequestId(value: string | undefined | null): value is string {
  if (!value) return false;
  return REQUEST_ID_RE.test(value.trim());
}

export function resolveRequestId(incoming: string | undefined | null): string {
  const trimmed = incoming?.trim();
  if (isSafeClientRequestId(trimmed)) return trimmed;
  return randomUUID();
}

export function sanitizeProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'error');
  return sanitizeFfmpegError(raw).slice(0, 180);
}

export function sanitizeFfmpegError(message: string): string {
  return redactLogString(message)
    .replace(/[A-Za-z]:\\[^\s"'\\]+/g, '[path]')
    .replace(/\/(?:[^\s"'\\]+\/)+[^\s"'\\]+/g, '[path]')
    .replace(/ffmpeg-static[^\s]*/gi, 'ffmpeg')
    .slice(0, 240);
}

export function redactLogString(value: string): string {
  let out = value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  out = out.replace(/https?:\/\/[^\s"]+/gi, (url) => (SIGNED_URL_HINT.test(url) ? '[signed-url]' : '[url]'));
  if (JWT_HINT.test(out.trim()) || SECRET_VALUE.test(out)) {
    return '[redacted]';
  }
  return out.slice(0, 500);
}

export function safeErrorDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET_KEY_NAME.test(key) || key === 'stack' || key === 'headers') continue;
    if (typeof value === 'string') {
      if (value.length > 180 || SECRET_VALUE.test(value) || JWT_HINT.test(value) || SIGNED_URL_HINT.test(value)) {
        continue;
      }
      out[key] = redactLogString(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function publicHealthPayload(ready: boolean): { status: 'ok' | 'not_ready' } {
  return { status: ready ? 'ok' : 'not_ready' };
}

export function shouldSkipRequestLog(path: string): boolean {
  return path === '/health' || path.startsWith('/health?');
}

export function isSlowRequest(durationMs: number): boolean {
  return durationMs >= SLOW_REQUEST_MS;
}

export function logEvent(entry: StructuredLog): void {
  if (entry.level === 'debug' && isProduction()) return;
  const line: StructuredLog = {
    level: entry.level,
    ts: entry.ts || new Date().toISOString(),
    event: entry.event,
  };
  if (entry.requestId) line.requestId = entry.requestId;
  if (entry.method) line.method = entry.method;
  if (entry.route) line.route = entry.route.split('?')[0];
  if (entry.status != null) line.status = entry.status;
  if (entry.code) line.code = entry.code;
  if (entry.durationMs != null) line.durationMs = entry.durationMs;
  if (entry.message) line.message = redactLogString(entry.message);
  const text = JSON.stringify(line);
  if (entry.level === 'error') console.error(text);
  else if (entry.level === 'warn') console.warn(text);
  else console.info(text);
}

export function logProcessFailure(kind: 'unhandledRejection' | 'uncaughtException', err: unknown): void {
  logEvent({
    level: 'error',
    ts: new Date().toISOString(),
    event: kind,
    message: sanitizeProviderError(err),
  });
}
