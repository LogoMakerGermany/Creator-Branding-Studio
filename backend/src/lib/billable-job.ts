import { deductCoins, getCoinBalance } from '../services/coins.service.js';
import {
  getBillableCharge,
  newChargeId,
  refundBillableChargeOnce,
  settleBillableCharge,
} from '../services/billable-charge.service.js';
import { assertBillableJobCapacity } from '../services/job-limits.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { isAcceptingWork } from './runtime.js';
import { assertGenerationsKillSwitch } from './provider-gate.js';
import { ServiceError } from './errors.js';
import type { CoinSpendCategory } from '@ucbs/shared';

async function assertChargeAllowed(userId: string): Promise<void> {
  if (!isAcceptingWork()) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Server fährt herunter — bitte später erneut versuchen');
  }
  try {
    await assertGenerationsKillSwitch();
  } catch (err) {
    if (err instanceof ServiceError) {
      throw new AppError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
  await assertBillableJobCapacity(userId);
}

export interface BillableJob {
  status: string;
  error?: string;
  id?: string;
}

export interface CoinChargeOptions {
  chargeId?: string;
  jobId?: string;
  quoteId?: string;
}

/**
 * Deduct coins, run work, refund exactly once if the paid work did not succeed.
 * Handles failed status, throws, and unexpected errors.
 */
export async function withCoinCharge<T extends BillableJob>(
  userId: string,
  category: CoinSpendCategory,
  description: string,
  run: () => Promise<T>,
  options?: CoinChargeOptions
): Promise<{ job: T; coinsSpent: number; newBalance: number }> {
  await assertChargeAllowed(userId);

  const chargeId = options?.chargeId ?? newChargeId();
  const coinResult = await deductCoins(userId, category, description, {
    idempotencyKey: `charge:${chargeId}`,
    sourceType: 'generation',
    sourceId: chargeId,
    jobId: options?.jobId,
    quoteId: options?.quoteId,
    persistCharge: {
      id: chargeId,
      category,
      description,
      jobId: options?.jobId,
      quoteId: options?.quoteId,
    },
  });
  if (!coinResult.success) {
    throw new AppError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');
  }
  if (coinResult.duplicate) {
    throw new AppError(409, 'CHARGE_IDEMPOTENT', 'Diese Abbuchung wurde bereits ausgeführt.');
  }

  const charge = await getBillableCharge(chargeId);
  if (!charge) {
    throw new AppError(500, 'CHARGE_MISSING', 'Abbuchung ohne Charge-Datensatz');
  }

  let job: T;
  try {
    job = await run();
  } catch (err) {
    await refundBillableChargeOnce(charge, `${description} — Rückerstattung (Abbruch)`);
    if (err instanceof AppError) throw err;
    throw new AppError(
      503,
      'AI_GENERATION_FAILED',
      `${err instanceof Error ? err.message : description} — Coins wurden erstattet`
    );
  }

  if (job.status === 'failed') {
    await refundBillableChargeOnce(charge, `${description} — Rückerstattung (fehlgeschlagen)`);
    throw new AppError(
      503,
      'AI_GENERATION_FAILED',
      job.error || `${description} fehlgeschlagen — Coins wurden erstattet`
    );
  }

  await settleBillableCharge(chargeId, job.id);
  const newBalance = await getCoinBalance(userId);
  return { job, coinsSpent: coinResult.cost, newBalance };
}

export async function withCoinChargePack<T extends BillableJob>(
  userId: string,
  category: CoinSpendCategory,
  description: string,
  run: () => Promise<T[]>,
  options?: CoinChargeOptions
): Promise<{ jobs: T[]; coinsSpent: number; newBalance: number }> {
  await assertChargeAllowed(userId);

  const chargeId = options?.chargeId ?? newChargeId();
  const coinResult = await deductCoins(userId, category, description, {
    idempotencyKey: `charge:${chargeId}`,
    sourceType: 'generation',
    sourceId: chargeId,
    quoteId: options?.quoteId,
    persistCharge: {
      id: chargeId,
      category,
      description,
      quoteId: options?.quoteId,
    },
  });
  if (!coinResult.success) {
    throw new AppError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');
  }
  if (coinResult.duplicate) {
    throw new AppError(409, 'CHARGE_IDEMPOTENT', 'Diese Abbuchung wurde bereits ausgeführt.');
  }

  const charge = await getBillableCharge(chargeId);
  if (!charge) {
    throw new AppError(500, 'CHARGE_MISSING', 'Abbuchung ohne Charge-Datensatz');
  }

  let jobs: T[];
  try {
    jobs = await run();
  } catch (err) {
    await refundBillableChargeOnce(charge, `${description} — Rückerstattung (Abbruch)`);
    if (err instanceof AppError) throw err;
    throw new AppError(
      503,
      'AI_GENERATION_FAILED',
      `${description} fehlgeschlagen — Coins wurden erstattet`
    );
  }

  const anySuccess = jobs.some((j) => j.status === 'completed' || j.status === 'partial');
  if (!anySuccess) {
    await refundBillableChargeOnce(charge, `${description} — Rückerstattung (fehlgeschlagen)`);
    throw new AppError(
      503,
      'AI_GENERATION_FAILED',
      `${description} fehlgeschlagen — Coins wurden erstattet`
    );
  }

  await settleBillableCharge(chargeId);
  const newBalance = await getCoinBalance(userId);
  return { jobs, coinsSpent: coinResult.cost, newBalance };
}
