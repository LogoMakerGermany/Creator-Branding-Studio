import { CoinSpendCategory, COIN_COSTS, COIN_PACKAGE_DEFINITIONS } from '@ucbs/shared';
import type { CoinSourceType, CoinTransaction, CoinTransactionType } from '@ucbs/shared';
import { getStripePriceId } from '../config/env.js';
import { isDevMode } from '../config/env.js';
import { devStore } from '../lib/dev-store.js';
import { coinsLockKey, withDevLock } from '../lib/dev-mutex.js';
import { getUserById, updateCoinBalance } from './user.service.js';
import { randomUUID } from 'node:crypto';

export const COIN_PACKAGES = COIN_PACKAGE_DEFINITIONS.map((pkg) => ({
  ...pkg,
  stripePriceId: getStripePriceId(pkg.id),
}));

const TX_COLLECTION = 'coin_transactions';
const IDEMP_COLLECTION = 'coin_idempotency';

export interface CoinTxOptions {
  idempotencyKey?: string;
  sourceType?: CoinSourceType | string;
  sourceId?: string;
  jobId?: string;
  quoteId?: string;
  paymentProvider?: 'stripe' | 'paypal';
  paymentReference?: string;
  refundOfTransactionId?: string;
  adminActorId?: string;
  reason?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  stripeSessionId?: string;
  paypalOrderId?: string;
  packageId?: string;
  provider?: 'stripe' | 'paypal';
  persistCharge?: {
    id: string;
    category?: string;
    description: string;
    jobId?: string;
    quoteId?: string;
  };
}

export interface CoinMutationResult {
  success: boolean;
  duplicate: boolean;
  newBalance: number;
  previousBalance: number;
  amount: number;
  transactionId?: string;
}

function sanitizeDocId(key: string): string {
  return key.replace(/[/#[\]]/g, '_').slice(0, 700);
}

function buildTransaction(params: {
  id: string;
  userId: string;
  type: CoinTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  options?: CoinTxOptions;
}): CoinTransaction {
  const { id, userId, type, amount, balanceBefore, balanceAfter, description, options } = params;
  const tx: CoinTransaction = {
    id,
    userId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    description,
    createdAt: new Date().toISOString(),
  };
  if (options?.category) tx.category = options.category;
  if (options?.reason) tx.reason = options.reason;
  if (options?.sourceType) tx.sourceType = options.sourceType;
  if (options?.sourceId) tx.sourceId = options.sourceId;
  if (options?.jobId) tx.jobId = options.jobId;
  if (options?.quoteId) tx.quoteId = options.quoteId;
  if (options?.paymentProvider) tx.paymentProvider = options.paymentProvider;
  if (options?.paymentReference) tx.paymentReference = options.paymentReference;
  if (options?.refundOfTransactionId) tx.refundOfTransactionId = options.refundOfTransactionId;
  if (options?.idempotencyKey) tx.idempotencyKey = options.idempotencyKey;
  if (options?.adminActorId) tx.adminActorId = options.adminActorId;
  if (options?.stripeSessionId) tx.stripePaymentIntentId = options.stripeSessionId;
  if (options?.paypalOrderId) tx.paypalOrderId = options.paypalOrderId;
  if (options?.packageId || options?.provider || options?.metadata) {
    tx.metadata = {
      ...(options.metadata ?? {}),
      ...(options.packageId ? { packageId: options.packageId } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
    };
  }
  return tx;
}

async function readIdempotency(
  key: string
): Promise<{ transactionId: string; newBalance: number; previousBalance: number; amount: number } | null> {
  const id = sanitizeDocId(key);
  if (isDevMode()) {
    const row = devStore.getFromCollection(IDEMP_COLLECTION, id);
    if (!row?.transactionId) return null;
    return {
      transactionId: String(row.transactionId),
      newBalance: Number(row.newBalance ?? 0),
      previousBalance: Number(row.previousBalance ?? 0),
      amount: Number(row.amount ?? 0),
    };
  }
  const { getFirestore } = await import('../config/firebase.js');
  const snap = await getFirestore().collection(IDEMP_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    transactionId: String(data.transactionId),
    newBalance: Number(data.newBalance ?? 0),
    previousBalance: Number(data.previousBalance ?? 0),
    amount: Number(data.amount ?? 0),
  };
}

function duplicateResult(
  hit: { transactionId: string; newBalance: number; previousBalance: number; amount: number },
  successIfCredit: boolean
): CoinMutationResult {
  const success = hit.amount >= 0 ? true : successIfCredit;
  return {
    success: hit.amount < 0 ? hit.amount !== 0 : success,
    duplicate: true,
    newBalance: hit.newBalance,
    previousBalance: hit.previousBalance,
    amount: hit.amount,
    transactionId: hit.transactionId,
  };
}

async function applyMutationDev(input: {
  userId: string;
  delta: number;
  type: CoinTransactionType;
  description: string;
  options?: CoinTxOptions;
}): Promise<CoinMutationResult> {
  return withDevLock(coinsLockKey(input.userId), async () => {
    if (input.options?.idempotencyKey) {
      const hit = await readIdempotency(input.options.idempotencyKey);
      if (hit) {
        return {
          success: hit.amount >= 0 || true,
          duplicate: true,
          newBalance: hit.newBalance,
          previousBalance: hit.previousBalance,
          amount: hit.amount,
          transactionId: hit.transactionId,
        };
      }
    }

    const user = await getUserById(input.userId);
    if (!user) throw new Error('User not found');
    const previousBalance = user.coinBalance ?? 0;
    if (input.delta < 0 && previousBalance < Math.abs(input.delta)) {
      return {
        success: false,
        duplicate: false,
        newBalance: previousBalance,
        previousBalance,
        amount: input.delta,
      };
    }

    const newBalance = previousBalance + input.delta;
    await updateCoinBalance(input.userId, newBalance);
    const tx = buildTransaction({
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      amount: input.delta,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      description: input.description,
      options: input.options,
    });
    const txRecord = tx as unknown as Record<string, unknown>;
    devStore.addTransaction(txRecord);
    devStore.saveToCollection(TX_COLLECTION, tx.id, txRecord);
    if (input.options?.idempotencyKey) {
      devStore.saveToCollection(IDEMP_COLLECTION, sanitizeDocId(input.options.idempotencyKey), {
        transactionId: tx.id,
        userId: input.userId,
        newBalance,
        previousBalance,
        amount: input.delta,
        createdAt: tx.createdAt,
      });
    }
    if (input.options?.persistCharge && input.delta < 0) {
      const now = tx.createdAt;
      const pc = input.options.persistCharge;
      devStore.saveToCollection('billable_charges', pc.id, {
        id: pc.id,
        userId: input.userId,
        amount: Math.abs(input.delta),
        chargeTransactionId: tx.id,
        status: 'charged',
        category: pc.category,
        description: pc.description,
        jobId: pc.jobId,
        quoteId: pc.quoteId,
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      success: true,
      duplicate: false,
      newBalance,
      previousBalance,
      amount: input.delta,
      transactionId: tx.id,
    };
  });
}

async function applyMutationFirestore(input: {
  userId: string;
  delta: number;
  type: CoinTransactionType;
  description: string;
  options?: CoinTxOptions;
}): Promise<CoinMutationResult> {
  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const userRef = db.collection('users').doc(input.userId);
  const txId = randomUUID();
  const txRef = db.collection(TX_COLLECTION).doc(txId);
  const idempRef = input.options?.idempotencyKey
    ? db.collection(IDEMP_COLLECTION).doc(sanitizeDocId(input.options.idempotencyKey))
    : null;

  return db.runTransaction(async (transaction) => {
    if (idempRef) {
      const existing = await transaction.get(idempRef);
      if (existing.exists) {
        const data = existing.data()!;
        return {
          success: true,
          duplicate: true,
          newBalance: Number(data.newBalance ?? 0),
          previousBalance: Number(data.previousBalance ?? 0),
          amount: Number(data.amount ?? 0),
          transactionId: String(data.transactionId),
        };
      }
    }

    const snap = await transaction.get(userRef);
    if (!snap.exists) throw new Error('User not found');
    const previousBalance = Number(snap.data()?.coinBalance ?? 0);
    if (input.delta < 0 && previousBalance < Math.abs(input.delta)) {
      return {
        success: false,
        duplicate: false,
        newBalance: previousBalance,
        previousBalance,
        amount: input.delta,
      };
    }

    const newBalance = previousBalance + input.delta;
    const now = new Date().toISOString();
    transaction.update(userRef, { coinBalance: newBalance, updatedAt: now });
    const tx = buildTransaction({
      id: txId,
      userId: input.userId,
      type: input.type,
      amount: input.delta,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      description: input.description,
      options: input.options,
    });
    transaction.set(txRef, tx);
    if (idempRef) {
      transaction.set(idempRef, {
        transactionId: txId,
        userId: input.userId,
        newBalance,
        previousBalance,
        amount: input.delta,
        createdAt: now,
      });
    }
    if (input.options?.persistCharge && input.delta < 0) {
      const pc = input.options.persistCharge;
      const chargeRef = db.collection('billable_charges').doc(pc.id);
      transaction.set(chargeRef, {
        id: pc.id,
        userId: input.userId,
        amount: Math.abs(input.delta),
        chargeTransactionId: txId,
        status: 'charged',
        category: pc.category,
        description: pc.description,
        jobId: pc.jobId,
        quoteId: pc.quoteId,
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      success: true,
      duplicate: false,
      newBalance,
      previousBalance,
      amount: input.delta,
      transactionId: txId,
    };
  });
}

export async function applyCoinMutation(input: {
  userId: string;
  delta: number;
  type: CoinTransactionType;
  description: string;
  options?: CoinTxOptions;
}): Promise<CoinMutationResult> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error('Delta must be a non-zero integer');
  }
  if (isDevMode()) {
    return applyMutationDev(input);
  }
  return applyMutationFirestore(input);
}

export async function getCoinBalance(userId: string): Promise<number> {
  const user = await getUserById(userId);
  return user?.coinBalance ?? 0;
}

export async function deductCoins(
  userId: string,
  category: CoinSpendCategory,
  description: string,
  options?: CoinTxOptions
): Promise<{ success: boolean; newBalance: number; cost: number; transactionId?: string; duplicate?: boolean }> {
  const cost = COIN_COSTS[category];
  const result = await applyCoinMutation({
    userId,
    delta: -cost,
    type: 'spend',
    description,
    options: {
      ...options,
      category,
      sourceType: options?.sourceType ?? 'generation',
    },
  });
  if (!result.success) {
    return { success: false, newBalance: result.newBalance, cost, duplicate: result.duplicate };
  }
  return {
    success: true,
    newBalance: result.newBalance,
    cost,
    transactionId: result.transactionId,
    duplicate: result.duplicate,
  };
}

export async function deductAmount(
  userId: string,
  amount: number,
  description: string,
  options?: CoinTxOptions
): Promise<{ success: boolean; newBalance: number; cost: number; transactionId?: string; duplicate?: boolean }> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  const result = await applyCoinMutation({
    userId,
    delta: -amount,
    type: 'spend',
    description,
    options: {
      ...options,
      category: options?.category ?? CoinSpendCategory.MARKETPLACE_PURCHASE,
      sourceType: options?.sourceType ?? 'marketplace',
    },
  });
  if (!result.success) {
    return { success: false, newBalance: result.newBalance, cost: amount, duplicate: result.duplicate };
  }
  return {
    success: true,
    newBalance: result.newBalance,
    cost: amount,
    transactionId: result.transactionId,
    duplicate: result.duplicate,
  };
}

export interface AddCoinsOptions extends CoinTxOptions {}

export async function addCoins(
  userId: string,
  amount: number,
  description: string,
  type: 'purchase' | 'bonus' | 'refund' = 'purchase',
  options?: AddCoinsOptions
): Promise<number> {
  const result = await addCoinsResult(userId, amount, description, type, options);
  if (!result.success) {
    throw new Error('Failed to credit coins');
  }
  return result.newBalance;
}

export async function addCoinsResult(
  userId: string,
  amount: number,
  description: string,
  type: 'purchase' | 'bonus' | 'refund' = 'purchase',
  options?: AddCoinsOptions
): Promise<CoinMutationResult> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  return applyCoinMutation({
    userId,
    delta: amount,
    type,
    description,
    options: {
      ...options,
      sourceType:
        options?.sourceType ??
        (type === 'refund' ? 'refund' : type === 'bonus' ? 'welcome' : 'purchase'),
      paymentProvider: options?.paymentProvider ?? options?.provider,
      paymentReference: options?.paymentReference ?? options?.stripeSessionId ?? options?.paypalOrderId,
    },
  });
}

export async function refundOnce(params: {
  userId: string;
  chargeTransactionId: string;
  amount: number;
  description: string;
  jobId?: string;
}): Promise<CoinMutationResult> {
  if (params.amount <= 0) {
    throw new Error('Refund amount must be positive');
  }
  return applyCoinMutation({
    userId: params.userId,
    delta: params.amount,
    type: 'refund',
    description: params.description,
    options: {
      idempotencyKey: `refund:${params.chargeTransactionId}`,
      refundOfTransactionId: params.chargeTransactionId,
      sourceType: 'refund',
      sourceId: params.chargeTransactionId,
      jobId: params.jobId,
    },
  });
}

export async function recordWelcomeGrant(params: {
  userId: string;
  amount: number;
  createdAt: string;
}): Promise<void> {
  if (params.amount <= 0) return;
  await applyCoinMutation({
    userId: params.userId,
    delta: params.amount,
    type: 'bonus',
    description: 'Willkommensbonus',
    options: {
      idempotencyKey: `welcome:${params.userId}`,
      sourceType: 'welcome',
      sourceId: params.userId,
    },
  });
}

/** Write welcome ledger without adding coins again (balance already set on create). */
export async function writeWelcomeLedgerOnly(params: {
  userId: string;
  amount: number;
  createdAt: string;
}): Promise<void> {
  if (params.amount <= 0) return;
  const key = `welcome:${params.userId}`;
  const existing = await readIdempotency(key);
  if (existing) return;

  const tx = buildTransaction({
    id: randomUUID(),
    userId: params.userId,
    type: 'bonus',
    amount: params.amount,
    balanceBefore: 0,
    balanceAfter: params.amount,
    description: 'Willkommensbonus',
    options: { idempotencyKey: key, sourceType: 'welcome', sourceId: params.userId },
  });
  tx.createdAt = params.createdAt;

  if (isDevMode()) {
    await withDevLock(coinsLockKey(params.userId), async () => {
      const again = await readIdempotency(key);
      if (again) return;
      const rec = tx as unknown as Record<string, unknown>;
      devStore.addTransaction(rec);
      devStore.saveToCollection(TX_COLLECTION, tx.id, rec);
      devStore.saveToCollection(IDEMP_COLLECTION, sanitizeDocId(key), {
        transactionId: tx.id,
        userId: params.userId,
        newBalance: params.amount,
        previousBalance: 0,
        amount: params.amount,
        createdAt: params.createdAt,
      });
    });
    return;
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const idempRef = db.collection(IDEMP_COLLECTION).doc(sanitizeDocId(key));
  const txRef = db.collection(TX_COLLECTION).doc(tx.id);
  await db.runTransaction(async (t) => {
    const snap = await t.get(idempRef);
    if (snap.exists) return;
    t.set(txRef, tx);
    t.set(idempRef, {
      transactionId: tx.id,
      userId: params.userId,
      newBalance: params.amount,
      previousBalance: 0,
      amount: params.amount,
      createdAt: params.createdAt,
    });
  });
}

export async function getTransactionById(id: string): Promise<CoinTransaction | null> {
  if (isDevMode()) {
    const row = devStore.getFromCollection(TX_COLLECTION, id);
    if (row) return row as unknown as CoinTransaction;
    const fromList = (devStore.getTransactions() as CoinTransaction[]).find((t) => t.id === id);
    return fromList ?? null;
  }
  const { getFirestore } = await import('../config/firebase.js');
  const snap = await getFirestore().collection(TX_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as CoinTransaction;
}

export async function getTransactions(userId: string, limit = 50) {
  if (isDevMode()) {
    return devStore.getTransactionsByUser(userId).slice(0, limit);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const snap = await db
    .collection(TX_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
