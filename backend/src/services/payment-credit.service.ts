import { AppError } from '../middleware/errorHandler.js';
import { addCoins, COIN_PACKAGES } from './coins.service.js';
import {
  beginPaymentCredit,
  markPaymentCredited,
  markPaymentEmailSent,
  markPaymentFailed,
} from './session-store.service.js';
import { dispatchTransactionalEmail, purchaseReceiptEmail } from './email.service.js';
import { getUserById } from './user.service.js';

export function getPackageById(packageId: string) {
  return COIN_PACKAGES.find((p) => p.id === packageId);
}

export interface CreditResult {
  credited: boolean;
  totalCoins: number;
  newBalance?: number;
  duplicate?: boolean;
}

let testBeforeCredit: (() => void) | null = null;

export function setPaymentCreditTestHook(hook: (() => void) | null): void {
  testBeforeCredit = hook;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

/**
 * Credits coins from a verified payment.
 * Package table is authoritative for coins, bonus, price, and currency.
 */
export async function creditCoinsFromPackagePurchase(params: {
  provider: 'stripe' | 'paypal';
  paymentId: string;
  userId: string;
  packageId: string;
  amountCents?: number;
  currency?: string;
  claimedCoins?: number;
  claimedBonus?: number;
}): Promise<CreditResult> {
  const { provider, paymentId, userId, packageId, amountCents, currency, claimedCoins, claimedBonus } =
    params;

  const pkg = getPackageById(packageId);
  if (!pkg) {
    throw new AppError(400, 'INVALID_PACKAGE', `Unbekanntes Coin-Paket: ${packageId}`);
  }

  if (amountCents == null || amountCents !== pkg.priceCents) {
    throw new AppError(400, 'AMOUNT_MISMATCH', 'Zahlungsbetrag stimmt nicht mit Paket überein');
  }

  const expectedCurrency = normalizeCurrency(pkg.currency || 'eur');
  if (currency && normalizeCurrency(currency) !== expectedCurrency) {
    throw new AppError(400, 'CURRENCY_MISMATCH', 'Währung stimmt nicht mit Paket überein');
  }

  if (claimedCoins != null && claimedCoins !== pkg.coins) {
    throw new AppError(400, 'COIN_MISMATCH', 'Coin-Anzahl stimmt nicht mit Paket überein');
  }
  if (claimedBonus != null && claimedBonus !== pkg.bonusCoins) {
    throw new AppError(400, 'BONUS_MISMATCH', 'Bonus stimmt nicht mit Paket überein');
  }

  if (!userId) {
    return { credited: false, totalCoins: 0 };
  }

  const totalCoins = pkg.coins + pkg.bonusCoins;
  const meta = { userId, packageId, coins: totalCoins };

  const begun = await beginPaymentCredit(provider, paymentId, meta);
  if (begun.action === 'duplicate') {
    await maybeSendPurchaseEmail(provider, paymentId, userId, pkg.name, totalCoins, begun.claim.emailSent);
    return { credited: false, totalCoins, newBalance: undefined, duplicate: true };
  }

  try {
    testBeforeCredit?.();
    const newBalance = await addCoins(
      userId,
      totalCoins,
      `${packageId} Paket (${totalCoins} Coins)`,
      'purchase',
      {
        provider,
        packageId,
        sourceType: 'purchase',
        sourceId: paymentId,
        paymentProvider: provider,
        paymentReference: paymentId,
        idempotencyKey: `purchase:${provider}:${paymentId}`,
        stripeSessionId: provider === 'stripe' ? paymentId : undefined,
        paypalOrderId: provider === 'paypal' ? paymentId : undefined,
      }
    );

    await markPaymentCredited(provider, paymentId, meta);
    console.log(
      `[${provider === 'stripe' ? 'Stripe' : 'PayPal'}] Credited ${totalCoins} coins for ${paymentId.slice(0, 12)}…`
    );

    await maybeSendPurchaseEmail(provider, paymentId, userId, pkg.name, totalCoins, false);
    return { credited: true, totalCoins, newBalance };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'credit failed';
    await markPaymentFailed(provider, paymentId, message);
    console.error(`[Payment] Credit failed for ${paymentId.slice(0, 12)}:`, message);
    throw err;
  }
}

async function maybeSendPurchaseEmail(
  provider: 'stripe' | 'paypal',
  paymentId: string,
  userId: string,
  packageName: string,
  totalCoins: number,
  alreadySent?: boolean
): Promise<void> {
  if (alreadySent) return;
  const user = await getUserById(userId);
  if (!user?.email) return;
  const result = await dispatchTransactionalEmail(
    `purchase:${provider}:${paymentId}`,
    purchaseReceiptEmail(user.email, user.displayName, packageName, totalCoins)
  );
  if (result.sent || result.duplicate) {
    await markPaymentEmailSent(provider, paymentId);
  }
}
