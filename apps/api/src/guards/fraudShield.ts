import { createHash } from 'crypto';
import type { DatabaseAdapter } from '@cbs/shared';
import { getDb } from '../db/localDb.js';

interface RateEntry { count: number; firstAt: number; }
const ipRates = new Map<string, RateEntry>();
const userRates = new Map<string, RateEntry>();
const uploadHashes = new Map<string, number>();
const bans = new Map<string, number>();

const WINDOW_MS = 60_000;
const IP_LIMIT = 30;
const USER_LIMIT = 15;
const BURST_LIMIT = 10;

const INJECTION_PATTERNS = [/ignore previous/i, /system prompt/i, /jailbreak/i, /<script/i];

export type FraudAction = 'allow' | 'warn' | 'throttle' | 'block';

export interface FraudResult {
  action: FraudAction;
  reason?: string;
}

function checkWindow(map: Map<string, RateEntry>, key: string, limit: number): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    map.set(key, { count: 1, firstAt: now });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

export async function checkFraud(
  ip: string,
  userId?: string,
  prompt?: string,
  uploadBuffer?: Buffer,
): Promise<FraudResult> {
  const banUntil = bans.get(userId || ip);
  if (banUntil && Date.now() < banUntil) {
    return { action: 'block', reason: 'Temporär gesperrt wegen Missbrauch' };
  }

  if (!checkWindow(ipRates, ip, IP_LIMIT)) {
    await logSecurity('fraud_rate_ip', 'high', `IP Rate Limit: ${ip}`, userId, ip);
    if (userId) bans.set(userId, Date.now() + 15 * 60 * 1000);
    return { action: 'block', reason: 'Zu viele Anfragen von dieser IP' };
  }

  if (userId && !checkWindow(userRates, userId, USER_LIMIT)) {
    await logSecurity('fraud_rate_user', 'medium', `User Rate Limit: ${userId}`, userId, ip);
    return { action: 'throttle', reason: 'Generierungslimit erreicht' };
  }

  if (prompt) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(prompt)) {
        await logSecurity('prompt_abuse', 'high', `Prompt injection detected`, userId, ip);
        bans.set(userId || ip, Date.now() + 30 * 60 * 1000);
        return { action: 'block', reason: 'Verdächtiger Prompt erkannt' };
      }
    }
  }

  if (uploadBuffer) {
    const hash = createHash('sha256').update(uploadBuffer).digest('hex');
    const count = (uploadHashes.get(hash) || 0) + 1;
    uploadHashes.set(hash, count);
    if (count > BURST_LIMIT) {
      await logSecurity('upload_abuse', 'medium', `Duplicate upload burst: ${hash.slice(0, 8)}`, userId, ip);
      return { action: 'throttle', reason: 'Upload-Limit erreicht' };
    }
  }

  return { action: 'allow' };
}

async function logSecurity(type: string, severity: 'low' | 'medium' | 'high', message: string, userId?: string, ip?: string): Promise<void> {
  const db = await getDb();
  await db.createSecurityEvent({
    id: crypto.randomUUID(),
    type,
    severity,
    message,
    userId,
    ip,
    createdAt: new Date().toISOString(),
  });
}

export async function audit(db: DatabaseAdapter, userId: string | undefined, action: string, resource: string, details: string, ip?: string): Promise<void> {
  await db.createAuditLog({
    id: crypto.randomUUID(),
    userId,
    action,
    resource,
    details,
    ip,
    createdAt: new Date().toISOString(),
  });
}
