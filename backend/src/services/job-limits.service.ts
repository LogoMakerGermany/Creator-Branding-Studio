import { AppError } from '../middleware/errorHandler.js';
import { getMaxConcurrentJobsPerUser, getMaxDailyJobsPerUser } from '../config/env.js';
import { listBillableChargesForUser } from './billable-charge.service.js';

function utcDayStartIso(now = Date.now()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Enforce ENV job limits for paid generation. Unset ENV = no limit.
 * Call before deducting coins.
 */
export async function assertBillableJobCapacity(userId: string): Promise<void> {
  const maxDaily = getMaxDailyJobsPerUser();
  const maxConcurrent = getMaxConcurrentJobsPerUser();
  if (maxDaily == null && maxConcurrent == null) return;

  const charges = await listBillableChargesForUser(userId);
  if (maxDaily != null) {
    const start = utcDayStartIso();
    const today = charges.filter((c) => c.createdAt >= start).length;
    if (today >= maxDaily) {
      throw new AppError(
        429,
        'DAILY_JOB_LIMIT',
        'Tageslimit für KI-Generierungen erreicht. Keine Coins wurden abgezogen.'
      );
    }
  }
  if (maxConcurrent != null) {
    const running = charges.filter((c) => c.status === 'charged').length;
    if (running >= maxConcurrent) {
      throw new AppError(
        429,
        'CONCURRENT_JOB_LIMIT',
        'Zu viele laufende Generierungen. Keine Coins wurden abgezogen.'
      );
    }
  }
}
