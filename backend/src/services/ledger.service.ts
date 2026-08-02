import type {
  BalanceLedgerEntry,
  LedgerEntryType,
  UserBalance,
} from '@ucbs/shared';
import { createHash, randomUUID } from 'node:crypto';
import { dsGet, dsListWhere, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { isDevMode } from '../config/env.js';
import { getFirestore } from '../config/firebase.js';

const LEDGER_COLLECTION = 'balance_ledger';
const BALANCE_COLLECTION = 'user_balances';
const IDEMPOTENCY_COLLECTION = 'ledger_idempotency';

function idempotencyDocId(userId: string, key: string): string {
  return createHash('sha256').update(`${userId}:${key}`).digest('hex');
}

async function getBalanceDoc(userId: string): Promise<UserBalance> {
  const row = await dsGet(BALANCE_COLLECTION, userId);
  if (row) return row as unknown as UserBalance;
  return {
    userId,
    balanceCents: 0,
    promotionalCents: 0,
    updatedAt: new Date().toISOString(),
  };
}

async function saveBalance(balance: UserBalance): Promise<void> {
  await dsSet(BALANCE_COLLECTION, balance.userId, balance as unknown as Record<string, unknown>);
}

export async function getUserBalanceCents(userId: string): Promise<UserBalance> {
  return getBalanceDoc(userId);
}

export async function listLedgerEntries(
  userId: string,
  limit = 50
): Promise<BalanceLedgerEntry[]> {
  const rows = await dsListWhere(LEDGER_COLLECTION, { userId }, 'createdAt', 'desc');
  return (rows as unknown as BalanceLedgerEntry[]).slice(0, limit);
}

export interface AppendLedgerInput {
  userId: string;
  type: LedgerEntryType;
  amountCents: number;
  description: string;
  idempotencyKey: string;
  createdBy: string;
  orderId?: string;
  generationJobId?: string;
  paymentId?: string;
  quoteId?: string;
  relatedTransactionId?: string;
  isPromotional?: boolean;
  expiresAt?: string;
}

function buildEntry(
  id: string,
  input: AppendLedgerInput,
  balanceAfterCents: number,
  createdAt: string
): BalanceLedgerEntry {
  return {
    id,
    userId: input.userId,
    type: input.type,
    amountCents: input.amountCents,
    balanceAfterCents,
    orderId: input.orderId,
    generationJobId: input.generationJobId,
    paymentId: input.paymentId,
    quoteId: input.quoteId,
    relatedTransactionId: input.relatedTransactionId,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
    isPromotional: input.isPromotional,
    expiresAt: input.expiresAt,
    createdBy: input.createdBy,
    createdAt,
  };
}

function nextPromotionalCents(balance: UserBalance, input: AppendLedgerInput): number {
  if (input.isPromotional && input.amountCents > 0) {
    return balance.promotionalCents + input.amountCents;
  }
  if (input.type === 'ORDER_CHARGE' || input.type === 'ORDER_RESERVATION') {
    const debit = Math.abs(Math.min(0, input.amountCents));
    return Math.max(0, balance.promotionalCents - debit);
  }
  return balance.promotionalCents;
}

/**
 * Append an immutable ledger entry and update balance.
 * Duplicate idempotencyKey returns the existing entry without double-applying.
 */
export async function appendLedgerEntry(
  input: AppendLedgerInput
): Promise<{ entry: BalanceLedgerEntry; balance: UserBalance; duplicate: boolean }> {
  if (!Number.isInteger(input.amountCents)) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Betrag muss ganzzahlig in Cent sein');
  }

  const idempId = idempotencyDocId(input.userId, input.idempotencyKey);

  if (isDevMode()) {
    const existingIdemp = await dsGet(IDEMPOTENCY_COLLECTION, idempId);
    if (existingIdemp?.entryId) {
      const entry = (await dsGet(LEDGER_COLLECTION, String(existingIdemp.entryId))) as unknown as BalanceLedgerEntry;
      const balance = await getBalanceDoc(input.userId);
      return { entry, balance, duplicate: true };
    }

    const balance = await getBalanceDoc(input.userId);
    if (input.amountCents < 0 && balance.balanceCents < Math.abs(input.amountCents)) {
      throw new ServiceError(402, 'INSUFFICIENT_BALANCE', 'Nicht genügend Guthaben');
    }

    const now = new Date().toISOString();
    const balanceAfterCents = balance.balanceCents + input.amountCents;
    const entry = buildEntry(randomUUID(), input, balanceAfterCents, now);
    const nextBalance: UserBalance = {
      userId: input.userId,
      balanceCents: balanceAfterCents,
      promotionalCents: nextPromotionalCents(balance, input),
      updatedAt: now,
    };

    await dsSet(LEDGER_COLLECTION, entry.id, entry as unknown as Record<string, unknown>);
    await saveBalance(nextBalance);
    await dsSet(IDEMPOTENCY_COLLECTION, idempId, {
      entryId: entry.id,
      userId: input.userId,
      key: input.idempotencyKey,
      createdAt: now,
    });
    return { entry, balance: nextBalance, duplicate: false };
  }

  const db = getFirestore();
  const idempRef = db.collection(IDEMPOTENCY_COLLECTION).doc(idempId);
  const balanceRef = db.collection(BALANCE_COLLECTION).doc(input.userId);
  const entryId = randomUUID();
  const entryRef = db.collection(LEDGER_COLLECTION).doc(entryId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const idempSnap = await tx.get(idempRef);
      if (idempSnap.exists) {
        const existingEntryId = idempSnap.data()?.entryId as string;
        const existingEntrySnap = await tx.get(db.collection(LEDGER_COLLECTION).doc(existingEntryId));
        const balSnap = await tx.get(balanceRef);
        const balance = balSnap.exists
          ? (balSnap.data() as UserBalance)
          : {
              userId: input.userId,
              balanceCents: 0,
              promotionalCents: 0,
              updatedAt: new Date().toISOString(),
            };
        return {
          entry: existingEntrySnap.data() as BalanceLedgerEntry,
          balance,
          duplicate: true as const,
        };
      }

      const balSnap = await tx.get(balanceRef);
      const balance = balSnap.exists
        ? (balSnap.data() as UserBalance)
        : {
            userId: input.userId,
            balanceCents: 0,
            promotionalCents: 0,
            updatedAt: new Date().toISOString(),
          };

      if (input.amountCents < 0 && balance.balanceCents < Math.abs(input.amountCents)) {
        throw new ServiceError(402, 'INSUFFICIENT_BALANCE', 'Nicht genügend Guthaben');
      }

      const now = new Date().toISOString();
      const balanceAfterCents = balance.balanceCents + input.amountCents;
      const entry = buildEntry(entryId, input, balanceAfterCents, now);
      const nextBalance: UserBalance = {
        userId: input.userId,
        balanceCents: balanceAfterCents,
        promotionalCents: nextPromotionalCents(balance, input),
        updatedAt: now,
      };

      tx.create(idempRef, {
        entryId,
        userId: input.userId,
        key: input.idempotencyKey,
        createdAt: now,
      });
      tx.set(entryRef, entry);
      tx.set(balanceRef, nextBalance);
      return { entry, balance: nextBalance, duplicate: false as const };
    });
    return result;
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw err;
  }
}

export async function creditTestBalance(
  userId: string,
  amountCents: number,
  adminId: string,
  description: string,
  expiresAt?: string
): Promise<{ entry: BalanceLedgerEntry; balance: UserBalance }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Testguthaben muss positiv und in Cent ganzzahlig sein');
  }

  const result = await appendLedgerEntry({
    userId,
    type: 'ADMIN_TEST_CREDIT',
    amountCents,
    description,
    idempotencyKey: `test-credit:${userId}:${adminId}:${amountCents}:${Date.now()}`,
    createdBy: adminId,
    isPromotional: true,
    expiresAt,
  });
  return { entry: result.entry, balance: result.balance };
}

export async function chargeOrderFromBalance(
  userId: string,
  amountCents: number,
  quoteId: string,
  createdBy: string
): Promise<{ entry: BalanceLedgerEntry; balance: UserBalance; duplicate: boolean }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Auftragsbetrag ungültig');
  }

  return appendLedgerEntry({
    userId,
    type: 'ORDER_CHARGE',
    amountCents: -amountCents,
    description: `Auftrag abgebucht (Quote ${quoteId})`,
    idempotencyKey: `order-charge:${quoteId}`,
    createdBy,
    quoteId,
  });
}

export async function refundOrderToBalance(
  userId: string,
  amountCents: number,
  quoteId: string,
  createdBy: string,
  reason: string
): Promise<{ entry: BalanceLedgerEntry; balance: UserBalance; duplicate: boolean }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Erstattungsbetrag ungültig');
  }

  return appendLedgerEntry({
    userId,
    type: 'ORDER_REFUND',
    amountCents,
    description: reason,
    idempotencyKey: `order-refund:${quoteId}`,
    createdBy,
    quoteId,
  });
}

export async function creditStripeTopUp(
  userId: string,
  amountCents: number,
  paymentId: string,
  createdBy: string
): Promise<{ entry: BalanceLedgerEntry; balance: UserBalance; duplicate: boolean }> {
  return appendLedgerEntry({
    userId,
    type: 'STRIPE_TOP_UP',
    amountCents,
    description: `Stripe Aufladung (${paymentId})`,
    idempotencyKey: `stripe-topup:${paymentId}`,
    createdBy,
    paymentId,
  });
}

export async function creditStripeOrderPayment(
  userId: string,
  amountCents: number,
  paymentId: string,
  quoteId: string,
  createdBy: string
): Promise<{ entry: BalanceLedgerEntry; balance: UserBalance; duplicate: boolean }> {
  return appendLedgerEntry({
    userId,
    type: 'STRIPE_PAYMENT',
    amountCents,
    description: `Stripe Zahlung für Quote ${quoteId}`,
    idempotencyKey: `stripe-order:${paymentId}`,
    createdBy,
    paymentId,
    quoteId,
  });
}
