import type { User } from '@cbs/shared';
import { getCoinCost, type CoinTransaction } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { env } from '../config.js';
import { withUserCoinLock } from './coinLock.js';

export function isTestModeUser(user?: User): boolean {
  if (!user) return false;
  return env.testMode || user.role === 'tester' || Boolean(user.isTester);
}

export function shouldUseMockGeneration(user?: User): boolean {
  if (!isTestModeUser(user)) return false;
  return !env.openaiApiKey && !env.replicateApiToken;
}

export async function getUserCoins(userId: string): Promise<number> {
  const db = await getDb();
  const user = await db.getUserById(userId);
  return user?.coins ?? 0;
}

export async function debitCoins(
  userId: string,
  assetType: string,
  reason: string,
  count = 1,
  freeInTestMode = false,
  user?: User,
): Promise<{ cost: number; balance: number }> {
  if (freeInTestMode && isTestModeUser(user)) {
    return { cost: 0, balance: await getUserCoins(userId) };
  }

  const cost = getCoinCost(assetType, count);

  return withUserCoinLock(userId, async () => {
    const db = await getDb();
    const tx = await db.applyCoinTransaction({
      id: crypto.randomUUID(),
      userId,
      type: 'debit',
      amount: cost,
      balanceAfter: 0,
      reason,
      metadata: { assetType, count },
      createdAt: new Date().toISOString(),
    });
    return { cost, balance: tx.balanceAfter };
  });
}

export async function creditCoins(
  userId: string,
  amount: number,
  reason: string,
  type: CoinTransaction['type'] = 'credit',
  metadata?: Record<string, unknown>,
): Promise<number> {
  return withUserCoinLock(userId, async () => {
    const db = await getDb();
    const tx = await db.applyCoinTransaction({
      id: crypto.randomUUID(),
      userId,
      type,
      amount,
      balanceAfter: 0,
      reason,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return tx.balanceAfter;
  });
}

export async function debitAmount(
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
  freeInTestMode = false,
  user?: User,
): Promise<{ cost: number; balance: number }> {
  if (amount <= 0) return { cost: 0, balance: await getUserCoins(userId) };
  if (freeInTestMode && isTestModeUser(user)) {
    return { cost: 0, balance: await getUserCoins(userId) };
  }

  return withUserCoinLock(userId, async () => {
    const db = await getDb();
    const tx = await db.applyCoinTransaction({
      id: crypto.randomUUID(),
      userId,
      type: 'debit',
      amount,
      balanceAfter: 0,
      reason,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return { cost: amount, balance: tx.balanceAfter };
  });
}

export async function refundCoins(userId: string, amount: number, reason: string): Promise<void> {
  if (amount <= 0) return;
  await creditCoins(userId, amount, reason, 'refund');
}
