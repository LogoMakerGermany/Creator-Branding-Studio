import { AppError } from '../middleware/errorHandler.js';
import { addCoins, COIN_PACKAGES } from './coins.service.js';
import {
  claimStripeSession,
  claimPayPalOrder,
} from './session-store.service.js';

export function getPackageById(packageId: string) {
  return COIN_PACKAGES.find((p) => p.id === packageId);
}

export interface CreditResult {
  credited: boolean;
  totalCoins: number;
  newBalance?: number;
  duplicate?: boolean;
}

/**
 * Credits coins from a verified payment.
 * Package table is authoritative for coin amounts — metadata amounts are ignored.
 * Payment id is claimed atomically to prevent double-credit races.
 */
export async function creditCoinsFromPackagePurchase(params: {
  provider: 'stripe' | 'paypal';
  paymentId: string;
  userId: string;
  packageId: string;
  amountCents?: number;
}): Promise<CreditResult> {
  const { provider, paymentId, userId, packageId, amountCents } = params;

  const pkg = getPackageById(packageId);
  if (!pkg) {
    throw new AppError(400, 'INVALID_PACKAGE', `Unbekanntes Coin-Paket: ${packageId}`);
  }

  if (amountCents != null && amountCents < pkg.priceCents) {
    throw new AppError(400, 'AMOUNT_MISMATCH', 'Zahlungsbetrag stimmt nicht mit Paket überein');
  }

  if (!userId) {
    return { credited: false, totalCoins: 0 };
  }

  const totalCoins = pkg.coins + pkg.bonusCoins;
  const meta = { userId, packageId, coins: totalCoins };

  const claimed =
    provider === 'stripe'
      ? await claimStripeSession(paymentId, meta)
      : await claimPayPalOrder(paymentId, meta);

  if (!claimed) {
    return { credited: false, totalCoins: 0, duplicate: true };
  }

  try {
    const newBalance = await addCoins(
      userId,
      totalCoins,
      `${packageId} Paket (${totalCoins} Coins)`,
      'purchase',
      {
        provider,
        packageId,
        stripeSessionId: provider === 'stripe' ? paymentId : undefined,
        paypalOrderId: provider === 'paypal' ? paymentId : undefined,
      }
    );

    if (provider === 'stripe') {
      console.log(`[Stripe] Credited ${totalCoins} coins for session ${paymentId.slice(0, 12)}…`);
    } else {
      console.log(`[PayPal] Credited ${totalCoins} coins for order ${paymentId.slice(0, 12)}…`);
    }

    return { credited: true, totalCoins, newBalance };
  } catch (err) {
    console.error(`[Payment] Credit failed after claim for ${paymentId}:`, err);
    throw err;
  }
}
