import { AppError } from '../middleware/errorHandler.js';
import { addCoins, COIN_PACKAGES } from './coins.service.js';
import {
  isPayPalOrderProcessed,
  markPayPalOrderProcessed,
  isStripeSessionProcessed,
  markStripeSessionProcessed,
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

export async function creditCoinsFromPackagePurchase(params: {
  provider: 'stripe' | 'paypal';
  paymentId: string;
  userId: string;
  packageId: string;
  coins: number;
  bonusCoins: number;
  amountCents?: number;
}): Promise<CreditResult> {
  const { provider, paymentId, userId, packageId, coins, bonusCoins, amountCents } = params;

  const isProcessed =
    provider === 'stripe'
      ? await isStripeSessionProcessed(paymentId)
      : await isPayPalOrderProcessed(paymentId);

  if (isProcessed) {
    return { credited: false, totalCoins: 0, duplicate: true };
  }

  const pkg = getPackageById(packageId);
  if (pkg && amountCents != null && amountCents < pkg.priceCents) {
    throw new AppError(400, 'AMOUNT_MISMATCH', 'Zahlungsbetrag stimmt nicht mit Paket überein');
  }

  if (!userId || coins <= 0) {
    return { credited: false, totalCoins: 0 };
  }

  const totalCoins = coins + bonusCoins;
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

  const meta = { userId, packageId, coins: totalCoins };
  if (provider === 'stripe') {
    await markStripeSessionProcessed(paymentId, meta);
    console.log(`[Stripe] Credited ${totalCoins} coins for session ${paymentId.slice(0, 12)}…`);
  } else {
    await markPayPalOrderProcessed(paymentId, meta);
    console.log(`[PayPal] Credited ${totalCoins} coins for order ${paymentId.slice(0, 12)}…`);
  }

  return { credited: true, totalCoins, newBalance };
}
