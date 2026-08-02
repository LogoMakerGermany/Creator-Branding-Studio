import { CoinSpendCategory, COIN_COSTS, COIN_PACKAGE_DEFINITIONS } from '@ucbs/shared';
import { getStripePriceId } from '../config/env.js';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getUserById, updateCoinBalance } from './user.service.js';
import { randomUUID } from 'node:crypto';

export const COIN_PACKAGES = COIN_PACKAGE_DEFINITIONS.map((pkg) => ({
  ...pkg,
  stripePriceId: getStripePriceId(pkg.id),
}));

export async function getCoinBalance(userId: string): Promise<number> {
  const user = await getUserById(userId);
  return user?.coinBalance ?? 0;
}

async function writeTransaction(tx: Record<string, unknown>): Promise<void> {
  if (isDevMode()) {
    devStore.addTransaction(tx);
    return;
  }
  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  await db.collection('coin_transactions').doc(String(tx.id)).set(tx);
}

async function adjustBalanceAtomic(
  userId: string,
  delta: number
): Promise<{ success: boolean; newBalance: number; previousBalance: number }> {
  if (isDevMode()) {
    const user = await getUserById(userId);
    if (!user) throw new Error('User not found');
    const previousBalance = user.coinBalance ?? 0;
    if (delta < 0 && previousBalance < Math.abs(delta)) {
      return { success: false, newBalance: previousBalance, previousBalance };
    }
    const newBalance = previousBalance + delta;
    await updateCoinBalance(userId, newBalance);
    return { success: true, newBalance, previousBalance };
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const ref = db.collection('users').doc(userId);

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('User not found');
    const previousBalance = (snap.data()?.coinBalance as number) ?? 0;
    if (delta < 0 && previousBalance < Math.abs(delta)) {
      return { success: false, newBalance: previousBalance, previousBalance };
    }
    const newBalance = previousBalance + delta;
    transaction.update(ref, { coinBalance: newBalance, updatedAt: new Date().toISOString() });
    return { success: true, newBalance, previousBalance };
  });
}

export async function deductCoins(
  userId: string,
  category: CoinSpendCategory,
  description: string
): Promise<{ success: boolean; newBalance: number; cost: number }> {
  const cost = COIN_COSTS[category];
  const result = await adjustBalanceAtomic(userId, -cost);
  if (!result.success) {
    return { success: false, newBalance: result.newBalance, cost };
  }

  await writeTransaction({
    id: randomUUID(),
    userId,
    type: 'spend',
    amount: -cost,
    balanceAfter: result.newBalance,
    category,
    description,
    createdAt: new Date().toISOString(),
  });

  return { success: true, newBalance: result.newBalance, cost };
}

export async function deductAmount(
  userId: string,
  amount: number,
  description: string
): Promise<{ success: boolean; newBalance: number; cost: number }> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  const result = await adjustBalanceAtomic(userId, -amount);
  if (!result.success) {
    return { success: false, newBalance: result.newBalance, cost: amount };
  }

  await writeTransaction({
    id: randomUUID(),
    userId,
    type: 'spend',
    amount: -amount,
    balanceAfter: result.newBalance,
    category: CoinSpendCategory.MARKETPLACE_PURCHASE,
    description,
    createdAt: new Date().toISOString(),
  });

  return { success: true, newBalance: result.newBalance, cost: amount };
}

export interface AddCoinsOptions {
  stripeSessionId?: string;
  paypalOrderId?: string;
  packageId?: string;
  provider?: 'stripe' | 'paypal';
}

export async function addCoins(
  userId: string,
  amount: number,
  description: string,
  type: 'purchase' | 'bonus' | 'refund' = 'purchase',
  options?: AddCoinsOptions
): Promise<number> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  const result = await adjustBalanceAtomic(userId, amount);
  if (!result.success) {
    throw new Error('Failed to credit coins');
  }

  const tx: Record<string, unknown> = {
    id: randomUUID(),
    userId,
    type,
    amount,
    balanceAfter: result.newBalance,
    description,
    createdAt: new Date().toISOString(),
  };

  if (options?.stripeSessionId) {
    tx.stripePaymentIntentId = options.stripeSessionId;
  }
  if (options?.paypalOrderId) {
    tx.paypalOrderId = options.paypalOrderId;
  }
  if (options?.packageId || options?.provider) {
    tx.metadata = {
      packageId: options.packageId,
      provider: options.provider,
    };
  }

  await writeTransaction(tx);
  return result.newBalance;
}

export async function getTransactions(userId: string, limit = 50) {
  if (isDevMode()) {
    return devStore.getTransactionsByUser(userId).slice(0, limit);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const snap = await db
    .collection('coin_transactions')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
