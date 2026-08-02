import { randomUUID, randomBytes } from 'node:crypto';
import type { CreateInviteCodeInput, InviteCode } from '@ucbs/shared';
import { dsDelete, dsGet, dsList, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';

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
 * Validate and consume one use of an invite code.
 * Throws ServiceError with German messages on failure.
 */
export async function redeemInviteCode(
  code: string,
  email: string
): Promise<RedeemInviteResult> {
  const invite = await getInviteByCode(code);
  if (!invite || !invite.isActive) {
    throw new ServiceError(403, 'ACCESS_DENIED', 'Ungültiger oder inaktiver Einladungscode');
  }

  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    throw new ServiceError(403, 'ACCESS_DENIED', 'Einladungscode ist abgelaufen');
  }

  if (invite.currentUses >= invite.maximumUses) {
    throw new ServiceError(403, 'ACCESS_DENIED', 'Einladungscode wurde bereits zu oft verwendet');
  }

  if (invite.assignedEmail && invite.assignedEmail.toLowerCase() !== email.toLowerCase()) {
    throw new ServiceError(
      403,
      'ACCESS_DENIED',
      'Dieser Einladungscode ist einer anderen E-Mail-Adresse zugeordnet'
    );
  }

  const updated: InviteCode = {
    ...invite,
    currentUses: invite.currentUses + 1,
    updatedAt: new Date().toISOString(),
    isActive: invite.currentUses + 1 < invite.maximumUses ? invite.isActive : false,
  };
  await dsSet(COLLECTION, invite.id, updated as unknown as Record<string, unknown>);

  return {
    invite: updated,
    grantRole: invite.grantRole || 'tester',
  };
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
