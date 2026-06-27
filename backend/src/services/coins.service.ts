import { CoinSpendCategory, COIN_COSTS } from '@ucbs/shared';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getUserById, updateCoinBalance } from './user.service.js';
import { randomUUID } from 'node:crypto';

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

export async function addCoins(
  userId: string,
  amount: number,
  description: string,
  type: 'purchase' | 'bonus' | 'refund' = 'purchase'
): Promise<number> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const balance = user.coinBalance ?? 0;
  const newBalance = balance + amount;
  await updateCoinBalance(userId, newBalance);

  const tx = {
    id: randomUUID(),
    userId,
    type,
    amount,
    balanceAfter: newBalance,
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

export const COIN_PACKAGES = [
  { id: 'starter', name: 'Starter', coins: 100, priceCents: 499, bonusCoins: 0, currency: 'eur', isPopular: false },
  { id: 'pro', name: 'Pro', coins: 500, priceCents: 1999, bonusCoins: 50, currency: 'eur', isPopular: true },
  { id: 'ultimate', name: 'Ultimate', coins: 1500, priceCents: 4999, bonusCoins: 200, currency: 'eur', isPopular: false },
];
