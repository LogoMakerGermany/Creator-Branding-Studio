import { randomUUID, randomBytes } from 'node:crypto';
import type { CreateInviteCodeInput, InviteCode } from '@ucbs/shared';
import { dsDelete, dsGet, dsList, dsSet } from '../lib/data-store.js';
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

  const invite: InviteCode = {
    id: randomUUID(),
    code,
    description: input.description.trim(),
    assignedEmail: input.assignedEmail?.trim().toLowerCase() || undefined,
    maximumUses: input.maximumUses && input.maximumUses > 0 ? input.maximumUses : 1,
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

/**
 * Validate and consume one use of an invite code atomically.
 */
export async function redeemInviteCode(
  code: string,
  email: string,
  userId?: string
): Promise<RedeemInviteResult> {
  const invite = await getInviteByCode(code);
  if (!invite || !invite.isActive) {
    throw new ServiceError(403, 'ACCESS_DENIED', 'Ungültiger oder inaktiver Einladungscode');
  }

  const apply = async (current: InviteCode): Promise<RedeemInviteResult> => {
    if (!current.isActive) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'Ungültiger oder inaktiver Einladungscode');
    }
    if (current.expiresAt && new Date(current.expiresAt).getTime() < Date.now()) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'Einladungscode ist abgelaufen');
    }
    if (current.currentUses >= current.maximumUses) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'Einladungscode wurde bereits zu oft verwendet');
    }
    if (current.assignedEmail && current.assignedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new ServiceError(
        403,
        'ACCESS_DENIED',
        'Dieser Einladungscode ist einer anderen E-Mail-Adresse zugeordnet'
      );
    }

    const usedBy = [...(current.usedBy ?? [])];
    if (userId) {
      usedBy.push({ userId, usedAt: new Date().toISOString() });
    }

    const updated: InviteCode = {
      ...current,
      currentUses: current.currentUses + 1,
      usedBy,
      updatedAt: new Date().toISOString(),
      isActive: current.currentUses + 1 < current.maximumUses ? current.isActive : false,
    };
    await dsSet(COLLECTION, updated.id, updated as unknown as Record<string, unknown>);
    return { invite: updated, grantRole: current.grantRole || 'tester' };
  };

  if (isDevMode()) {
    return withDevLock(inviteLockKey(invite.id), async () => {
      const fresh = (await dsGet(COLLECTION, invite.id)) as unknown as InviteCode | null;
      if (!fresh) {
        throw new ServiceError(403, 'ACCESS_DENIED', 'Ungültiger oder inaktiver Einladungscode');
      }
      return apply(fresh);
    });
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(invite.id);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'Ungültiger oder inaktiver Einladungscode');
    }
    const current = { id: snap.id, ...snap.data() } as InviteCode;
    if (!current.isActive) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'Ungültiger oder inaktiver Einladungscode');
    }
    if (current.expiresAt && new Date(current.expiresAt).getTime() < Date.now()) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'Einladungscode ist abgelaufen');
    }
    if (current.currentUses >= current.maximumUses) {
      throw new ServiceError(403, 'ACCESS_DENIED', 'Einladungscode wurde bereits zu oft verwendet');
    }
    if (current.assignedEmail && current.assignedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new ServiceError(
        403,
        'ACCESS_DENIED',
        'Dieser Einladungscode ist einer anderen E-Mail-Adresse zugeordnet'
      );
    }
    const usedBy = [...(current.usedBy ?? [])];
    if (userId) usedBy.push({ userId, usedAt: new Date().toISOString() });
    const updated: InviteCode = {
      ...current,
      currentUses: current.currentUses + 1,
      usedBy,
      updatedAt: new Date().toISOString(),
      isActive: current.currentUses + 1 < current.maximumUses ? current.isActive : false,
    };
    t.set(ref, updated);
    return { invite: updated, grantRole: current.grantRole || 'tester' };
  });
}

export async function validateInviteCode(
  code: string,
  email?: string
): Promise<{ valid: boolean; grantRole?: 'user' | 'tester'; message?: string }> {
  try {
    const invite = await getInviteByCode(code);
    if (!invite || !invite.isActive) {
      return { valid: false, message: 'Ungültiger oder inaktiver Einladungscode' };
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return { valid: false, message: 'Einladungscode ist abgelaufen' };
    }
    if (invite.currentUses >= invite.maximumUses) {
      return { valid: false, message: 'Einladungscode wurde bereits zu oft verwendet' };
    }
    if (
      email &&
      invite.assignedEmail &&
      invite.assignedEmail.toLowerCase() !== email.toLowerCase()
    ) {
      return {
        valid: false,
        message: 'Dieser Einladungscode ist einer anderen E-Mail-Adresse zugeordnet',
      };
    }
    return { valid: true, grantRole: invite.grantRole || 'tester' };
  } catch {
    return { valid: false, message: 'Einladungscode konnte nicht geprüft werden' };
  }
}
