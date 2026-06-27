import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  isPayPalConfigured,
} from '../services/paypal.service.js';
import { creditCoinsFromPackagePurchase } from '../services/payment-credit.service.js';
import { isDevAuthEnabled, isProduction } from '../config/env.js';
import { getPackageById } from '../services/payment-credit.service.js';
import { addCoins } from '../services/coins.service.js';

export const paypalRoutes = Router();

const checkoutSchema = z.object({
  packageId: z.enum(['starter', 'pro', 'ultimate']),
});

const verifyOrderSchema = z.object({
  orderId: z.string().min(1),
});

async function creditFromPayPalOrder(
  orderId: string,
  expectedUserId?: string
): Promise<{ credited: boolean; totalCoins: number; newBalance?: number; duplicate?: boolean }> {
  let order = await getPayPalOrder(orderId);

  if (order.status === 'APPROVED') {
    order = await capturePayPalOrder(orderId);
  }

  if (order.status !== 'COMPLETED') {
    return { credited: false, totalCoins: 0 };
  }

  if (expectedUserId && order.userId && order.userId !== expectedUserId) {
    throw new AppError(403, 'FORBIDDEN', 'Diese Zahlung gehört nicht zu deinem Konto');
  }

  if (!order.userId || !order.packageId) {
    return { credited: false, totalCoins: 0 };
  }

  return creditCoinsFromPackagePurchase({
    provider: 'paypal',
    paymentId: orderId,
    userId: order.userId,
    packageId: order.packageId,
    coins: order.coins,
    bonusCoins: order.bonusCoins,
    amountCents: order.amountCents,
  });
}

paypalRoutes.post(
  '/checkout',
  authenticate,
  requirePermission(Permission.PURCHASE_COINS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { packageId } = checkoutSchema.parse(req.body);

    if (!isPayPalConfigured()) {
      if (isDevAuthEnabled()) {
        throw new AppError(
          503,
          'PAYPAL_NOT_CONFIGURED',
          'PayPal nicht konfiguriert – nutze Dev-Kauf (nur Entwicklung)'
        );
      }
      throw new AppError(503, 'PAYPAL_NOT_CONFIGURED', 'PayPal ist nicht konfiguriert');
    }

    const order = await createPayPalOrder(req.user!.uid, packageId);
    sendSuccess(res, order);
  })
);

paypalRoutes.post(
  '/dev-purchase',
  authenticate,
  requirePermission(Permission.PURCHASE_COINS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (isProduction() || !isDevAuthEnabled()) {
      throw new AppError(403, 'FORBIDDEN', 'Dev-Kauf ist in Production deaktiviert');
    }

    const { packageId } = checkoutSchema.parse(req.body);
    const pkg = getPackageById(packageId);
    if (!pkg) throw new AppError(404, 'NOT_FOUND', 'Paket nicht gefunden');

    const totalCoins = pkg.coins + pkg.bonusCoins;
    const newBalance = await addCoins(
      req.user!.uid,
      totalCoins,
      `${pkg.name} Paket (Dev-Kauf)`,
      'purchase'
    );

    sendSuccess(res, {
      success: true,
      coinsAdded: totalCoins,
      newBalance,
      message: 'Dev-Kauf erfolgreich – PayPal simuliert',
    });
  })
);

paypalRoutes.post(
  '/verify-order',
  authenticate,
  requirePermission(Permission.PURCHASE_COINS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!isPayPalConfigured()) {
      throw new AppError(503, 'PAYPAL_NOT_CONFIGURED', 'PayPal ist nicht konfiguriert');
    }

    const { orderId } = verifyOrderSchema.parse(req.body);
    const result = await creditFromPayPalOrder(orderId, req.user!.uid);

    sendSuccess(res, {
      credited: result.credited,
      duplicate: result.duplicate ?? false,
      coinsAdded: result.totalCoins,
      newBalance: result.newBalance,
    });
  })
);

paypalRoutes.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (!isPayPalConfigured()) {
      res.status(503).json({ error: 'PayPal not configured' });
      return;
    }

    const event = req.body as {
      event_type?: string;
      resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
    };

    if (event.event_type === 'CHECKOUT.ORDER.APPROVED' || event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId =
        event.resource?.supplementary_data?.related_ids?.order_id ?? event.resource?.id;

      if (orderId) {
        try {
          const result = await creditFromPayPalOrder(orderId);
          if (result.duplicate) {
            res.json({ received: true, duplicate: true });
            return;
          }
        } catch (err) {
          console.error('[PayPal] Webhook credit failed:', err);
        }
      }
    }

    res.json({ received: true });
  })
);
