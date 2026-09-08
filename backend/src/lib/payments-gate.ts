import { arePaymentsEnabled } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { getSystemSettings } from '../services/system-settings.service.js';

export const PAYMENTS_DISABLED_CODE = 'PAYMENTS_DISABLED';

function paymentsDisabledError(): AppError {
  return new AppError(503, PAYMENTS_DISABLED_CODE, 'Zahlungen sind derzeit deaktiviert');
}

/** Env kill-switch only. Missing, empty, or any value other than "true" is disabled. */
export function isPaymentsEnvEnabled(): boolean {
  return arePaymentsEnabled();
}

/**
 * Blocks starting new checkouts, PayPal orders, and purchase credits.
 * Does not apply to webhook / verify paths for in-flight payments.
 */
export async function assertNewPaymentsAllowed(): Promise<void> {
  if (!arePaymentsEnabled()) {
    throw paymentsDisabledError();
  }
  const settings = await getSystemSettings();
  if (!settings.paymentsEnabled) {
    throw paymentsDisabledError();
  }
}
