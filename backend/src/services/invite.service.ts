import { randomUUID, randomBytes } from 'node:crypto';
import type { CreateInviteCodeInput, InviteCode } from '@ucbs/shared';
import { dsDelete, dsGet, dsList, dsSet } from '../lib/data-store.js';
import { firestoreDocId, omitUndefinedFields } from '../lib/firestore-payload.js';
import { ServiceError } from '../lib/errors.js';
import { isDevMode } from '../config/env.js';
import { inviteLockKey, withDevLock } from '../lib/dev-mutex.js';

const COLLECTION = 'invite_codes';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

function generateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export async function listInviteCodes(): Promise<InviteCode[]> {
  const rows = await dsList(COLLECTION, { orderBy: 'createdAt', order: 'desc' });
  return rows as unknown as InviteCode[];
}

export async function getInviteByCode(code: string): Promise<InviteCode | null> {
  const normalized = normalizeCode(code);
  const rows = await dsList(COLLECTION);
  const match = (rows as unknown as InviteCode[]).find((r) => normalizeCode(r.code) === normalized);
  return match ?? null;
}

export async function getInviteById(id: string): Promise<InviteCode | null> {
  const row = await dsGet(COLLECTION, id);
  return row ? (row as unknown as InviteCode) : null;
}

export async function createInviteCode(
  input: CreateInviteCodeInput,
  createdBy: string
): Promise<InviteCode> {
  const now = new Date().toISOString();
  const code = normalizeCode(input.code || generateCode());
  const existing = await getInviteByCode(code);
  if (existing) {
    throw new ServiceError(409, 'INVALID_INPUT', 'Einladungscode existiert bereits');
  }

  let maximumUses = 1;
  if (input.maximumUses !== undefined) {
    if (!Number.isInteger(input.maximumUses) || !Number.isFinite(input.maximumUses) || input.maximumUses <= 0) {
      throw new ServiceError(400, 'INVALID_INPUT', 'Ungültige Nutzungsanzahl');
    }
    maximumUses = input.maximumUses;
  }

  const invite: InviteCode = {
    id: randomUUID(),
    code,
    description: input.description.trim(),
    assignedEmail: input.assignedEmail?.trim().toLowerCase() || undefined,
    maximumUses,
    currentUses: 0,
    expiresAt: input.expiresAt,
    isActive: true,
    grantRole: input.grantRole || 'tester',
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await dsSet(COLLECTION, invite.id, invite as unknown as Record<string, unknown>);
  return invite;
}

export async function deactivateInviteCode(id: string): Promise<InviteCode> {
  const row = await dsGet(COLLECTION, id);
  if (!row) throw new ServiceError(404, 'INVALID_INPUT', 'Einladungscode nicht gefunden');
  const invite = row as unknown as InviteCode;
  const updated: InviteCode = { ...invite, isActive: false, updatedAt: new Date().toISOString() };
  await dsSet(COLLECTION, id, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function deleteInviteCode(id: string): Promise<void> {
  const row = await dsGet(COLLECTION, id);
  if (!row) throw new ServiceError(404, 'INVALID_INPUT', 'Einladungscode nicht gefunden');
  await dsDelete(COLLECTION, id);
}

export interface RedeemInviteResult {
  invite: InviteCode;
  grantRole: 'user' | 'tester';
}

export const INVITE_REQUIRED_MESSAGE =
  'Einladungscode erforderlich — NEXTER ist derzeit nur mit Einladung zugänglich';
export const INVITE_INVALID_MESSAGE = 'Ungültiger oder inaktiver Einladungscode';
export const INVITE_EXPIRED_MESSAGE = 'Einladungscode ist abgelaufen';
export const INVITE_EXHAUSTED_MESSAGE = 'Einladungscode wurde bereits zu oft verwendet';
export const INVITE_EMAIL_MISMATCH_MESSAGE =
  'Dieser Einladungscode ist an eine E-Mail-Adresse gebunden. Melde dich mit der eingeladenen E-Mail-Adresse an.';
export const INVITE_EMAIL_REQUIRED_MESSAGE =
  'Dieser Einladungscode ist an eine E-Mail-Adresse gebunden. Der gewählte Anbieter stellt für diese Anmeldung keine bestätigbare E-Mail-Adresse bereit. Melde dich zuerst mit der eingeladenen E-Mail-Adresse an und verknüpfe den Anbieter anschließend in deinen Einstellungen.';

export interface InviteEligibilityOptions {
  email?: string;
  emailVerified?: boolean;
}

function denyInvite(code: string, message: string): never {
  throw new ServiceError(403, code, message);
}

function assertInviteUsable(current: InviteCode): void {
  if (!current.isActive) denyInvite('INVITE_INVALID', INVITE_INVALID_MESSAGE);
  if (current.expiresAt && new Date(current.expiresAt).getTime() < Date.now()) {
    denyInvite('INVITE_EXPIRED', INVITE_EXPIRED_MESSAGE);
  }
  if (
    !Number.isInteger(current.currentUses) ||
    !Number.isFinite(current.currentUses) ||
    !Number.isInteger(current.maximumUses) ||
    !Number.isFinite(current.maximumUses) ||
    current.maximumUses <= 0
  ) {
    denyInvite('INVITE_INVALID', INVITE_INVALID_MESSAGE);
  }
  if (current.currentUses >= current.maximumUses) {
    denyInvite('INVITE_EXHAUSTED', INVITE_EXHAUSTED_MESSAGE);
  }
}

function assertAssignedEmailMatches(current: InviteCode, options?: InviteEligibilityOptions): void {
  if (!current.assignedEmail) return;
  const provided = options?.email?.trim().toLowerCase();
  if (!provided || options?.emailVerified !== true) {
    denyInvite('INVITE_EMAIL_REQUIRED', INVITE_EMAIL_REQUIRED_MESSAGE);
  }
  if (provided !== current.assignedEmail.toLowerCase()) {
    denyInvite('INVITE_EMAIL_MISMATCH', INVITE_EMAIL_MISMATCH_MESSAGE);
  }
}

function alreadyRedeemedBy(current: InviteCode, userId?: string): boolean {
  return Boolean(userId && (current.usedBy ?? []).some((row) => row.userId === userId));
}

function consumeInvite(current: InviteCode, userId?: string): InviteCode {
  const usedBy = [...(current.usedBy ?? [])];
  if (userId) usedBy.push({ userId, usedAt: new Date().toISOString() });
  return {
    ...current,
    currentUses: current.currentUses + 1,
    usedBy,
    updatedAt: new Date().toISOString(),
    isActive: current.currentUses + 1 < current.maximumUses ? current.isActive : false,
  };
}

/** Peek-only: does not consume uses. */
export async function assertInviteEligible(
  code: string,
  options?: InviteEligibilityOptions
): Promise<InviteCode> {
  const invite = await getInviteByCode(code);
  if (!invite || !invite.isActive) denyInvite('INVITE_INVALID', INVITE_INVALID_MESSAGE);
  assertInviteUsable(invite);
  assertAssignedEmailMatches(invite, options);
  return invite;
}

/**
 * Validate and consume one use of an invite code atomically.
 * Repeating redeem for the same userId is idempotent (sync retry).
 */
export async function redeemInviteCode(
  code: string,
  email?: string,
  userId?: string,
  options?: { emailVerified?: boolean }
): Promise<RedeemInviteResult> {
  const eligibility = { email, emailVerified: options?.emailVerified };
  const invite = await getInviteByCode(code);
  if (!invite) denyInvite('INVITE_INVALID', INVITE_INVALID_MESSAGE);
  if (alreadyRedeemedBy(invite, userId)) {
    return { invite, grantRole: invite.grantRole || 'tester' };
  }
  if (!invite.isActive) denyInvite('INVITE_INVALID', INVITE_INVALID_MESSAGE);

  const apply = async (current: InviteCode): Promise<RedeemInviteResult> => {
    if (alreadyRedeemedBy(current, userId)) {
      return { invite: current, grantRole: current.grantRole || 'tester' };
    }
    assertInviteUsable(current);
    assertAssignedEmailMatches(current, eligibility);
    const updated = consumeInvite(current, userId);
    await dsSet(COLLECTION, updated.id, updated as unknown as Record<string, unknown>);
    return { invite: updated, grantRole: current.grantRole || 'tester' };
  };

  if (isDevMode()) {
    return withDevLock(inviteLockKey(invite.id), async () => {
      const fresh = (await dsGet(COLLECTION, invite.id)) as unknown as InviteCode | null;
      if (!fresh) denyInvite('INVITE_INVALID', INVITE_INVALID_MESSAGE);
      return apply(fresh);
    });
  }

  const { getFirestore } = await import('../config/firebase.js');
  const { assertNoProductionWritesFromTests } = await import('../lib/production-write-guard.js');
  assertNoProductionWritesFromTests();
  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(firestoreDocId(invite.id));
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) denyInvite('INVITE_INVALID', INVITE_INVALID_MESSAGE);
    const current = { id: snap.id, ...snap.data() } as InviteCode;
    if (alreadyRedeemedBy(current, userId)) {
      return { invite: current, grantRole: current.grantRole || 'tester' };
    }
    assertInviteUsable(current);
    assertAssignedEmailMatches(current, eligibility);
    const updated = consumeInvite(current, userId);
    t.set(ref, omitUndefinedFields(updated as unknown as Record<string, unknown>));
    return { invite: updated, grantRole: current.grantRole || 'tester' };
  });
}

export async function validateInviteCode(
  code: string,
  email?: string
): Promise<{ valid: boolean }> {
  try {
    const invite = await getInviteByCode(code);
    if (!invite || !invite.isActive) return { valid: false };
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return { valid: false };
    if (invite.currentUses >= invite.maximumUses) return { valid: false };
    if (
      email &&
      invite.assignedEmail &&
      invite.assignedEmail.toLowerCase() !== email.toLowerCase()
    ) {
      return { valid: false };
    }
    return { valid: true };
  } catch {
    return { valid: false };
  }
}
