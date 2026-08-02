import { deductCoins, addCoins, getCoinBalance } from '../services/coins.service.js';
import { AppError } from '../middleware/errorHandler.js';
import type { CoinSpendCategory } from '@ucbs/shared';

export interface BillableJob {
  status: string;
  error?: string;
}

/**
 * Deduct coins, run work, refund and throw if the job failed.
 */
export async function withCoinCharge<T extends BillableJob>(
  userId: string,
  category: CoinSpendCategory,
  description: string,
  run: () => Promise<T>
): Promise<{ job: T; coinsSpent: number; newBalance: number }> {
  const coinResult = await deductCoins(userId, category, description);
  if (!coinResult.success) {
    throw new AppError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');
  }

  const job = await run();

  if (job.status === 'failed') {
    await addCoins(
      userId,
      coinResult.cost,
      `${description} — Rückerstattung (fehlgeschlagen)`,
      'refund'
    );
    throw new AppError(
      503,
      'AI_GENERATION_FAILED',
      job.error || `${description} fehlgeschlagen — Coins wurden erstattet`
    );
  }

  const newBalance = await getCoinBalance(userId);
  return { job, coinsSpent: coinResult.cost, newBalance };
}

export async function withCoinChargePack<T extends BillableJob>(
  userId: string,
  category: CoinSpendCategory,
  description: string,
  run: () => Promise<T[]>
): Promise<{ jobs: T[]; coinsSpent: number; newBalance: number }> {
  const coinResult = await deductCoins(userId, category, description);
  if (!coinResult.success) {
    throw new AppError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');
  }

  const jobs = await run();
  const anySuccess = jobs.some((j) => j.status === 'completed' || j.status === 'partial');

  if (!anySuccess) {
    await addCoins(
      userId,
      coinResult.cost,
      `${description} — Rückerstattung (fehlgeschlagen)`,
      'refund'
    );
    throw new AppError(
      503,
      'AI_GENERATION_FAILED',
      `${description} fehlgeschlagen — Coins wurden erstattet`
    );
  }

  const newBalance = await getCoinBalance(userId);
  return { jobs, coinsSpent: coinResult.cost, newBalance };
}
