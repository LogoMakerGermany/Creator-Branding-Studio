import { CoinSpendCategory, COIN_COSTS, COIN_PACKAGE_DEFINITIONS } from '@ucbs/shared';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getUserById, updateCoinBalance } from './user.service.js';
import { randomUUID } from 'node:crypto';

function stripePriceIdForPackage(packageId: string): string | undefined {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    ultimate: process.env.STRIPE_PRICE_ULTIMATE,
  };
  return map[packageId];
}

export const COIN_PACKAGES = COIN_PACKAGE_DEFINITIONS.map((pkg) => ({
  ...pkg,
  stripePriceId: stripePriceIdForPackage(pkg.id),
}));

export async function getCoinBalance(userId: string): Promise<number> {
  const user = await getUserById(userId);
  return user?.coinBalance ?? 0;
}

export async function deductCoins(
  userId: string,
  category: CoinSpendCategory,
  description: string
): Promise<{ success: boolean; newBalance: number; cost: number }> {
  const cost = COIN_COSTS[category];
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const balance = user.coinBalance ?? 0;
  if (balance < cost) {
    return { success: false, newBalance: balance, cost };
  }

  const newBalance = balance - cost;
  await updateCoinBalance(userId, newBalance);

  const tx = {
    id: randomUUID(),
    userId,
    type: 'spend',
    amount: -cost,
    balanceAfter: newBalance,
    category,
    description,
    createdAt: new Date().toISOString(),
  };

  if (isDevMode()) {
    devStore.addTransaction(tx);
  } else {
    const { getFirestore } = await import('../config/firebase.js');
    const db = getFirestore();
    await db.collection('coin_transactions').doc(tx.id).set(tx);
  }

  return { success: true, newBalance, cost };
}

export async function deductAmount(
  userId: string,
  amount: number,
  description: string
): Promise<{ success: boolean; newBalance: number; cost: number }> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const balance = user.coinBalance ?? 0;
  if (balance < amount) {
    return { success: false, newBalance: balance, cost: amount };
  }

  const newBalance = balance - amount;
  await updateCoinBalance(userId, newBalance);

  const tx = {
    id: randomUUID(),
    userId,
    type: 'spend',
    amount: -amount,
    balanceAfter: newBalance,
    category: CoinSpendCategory.MARKETPLACE_PURCHASE,
    description,
    createdAt: new Date().toISOString(),
  };

  if (isDevMode()) {
    devStore.addTransaction(tx);
  } else {
    const { getFirestore } = await import('../config/firebase.js');
    const db = getFirestore();
    await db.collection('coin_transactions').doc(tx.id).set(tx);
  }

  return { success: true, newBalance, cost: amount };
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
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const balance = user.coinBalance ?? 0;
  const newBalance = balance + amount;
  await updateCoinBalance(userId, newBalance);

  const tx: Record<string, unknown> = {
    id: randomUUID(),
    userId,
    type,
    amount,
    balanceAfter: newBalance,
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

  if (isDevMode()) {
    devStore.addTransaction(tx);
  } else {
    const { getFirestore } = await import('../config/firebase.js');
    const db = getFirestore();
    await db.collection('coin_transactions').doc(String(tx.id)).set(tx);
  }

  return newBalance;
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
