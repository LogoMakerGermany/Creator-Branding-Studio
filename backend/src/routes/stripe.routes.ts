import { Router } from 'express';
import type Stripe from 'stripe';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createCheckoutSession,
  constructWebhookEvent,
  retrieveCheckoutSession,
  isStripeConfigured,
} from '../services/stripe.service.js';
import {
  creditCoinsFromPackagePurchase,
  getPackageById,
} from '../services/payment-credit.service.js';
import { addCoins } from '../services/coins.service.js';
import { assertQuoteValidForPayment } from '../services/pricing.service.js';
import { creditStripeOrderPayment } from '../services/ledger.service.js';
import { claimStripeSession } from '../services/session-store.service.js';
import { isDevAuthEnabled, isProduction } from '../config/env.js';

export const stripeRoutes = Router();

const checkoutSchema = z.object({
  packageId: z.enum(['starter', 'pro', 'ultimate']),
});

const verifySessionSchema = z.object({
  sessionId: z.string().min(1),
});

async function processCheckoutSession(session: Stripe.Checkout.Session): Promise<{
  credited: boolean;
  totalCoins: number;
  newBalance?: number;
  duplicate?: boolean;
  kind?: string;
}> {
  if (session.payment_status !== 'paid') {
    return { credited: false, totalCoins: 0 };
  }

  const userId = session.metadata?.userId;
  if (!userId) {
    return { credited: false, totalCoins: 0 };
  }

  const paymentKind = session.metadata?.paymentKind || 'coin_package';

  if (paymentKind === 'order_quote') {
    const quoteId = session.metadata?.quoteId;
    const expectedCents = Number.parseInt(session.metadata?.totalCents || '', 10);
    if (!quoteId || !Number.isInteger(expectedCents)) {
      return { credited: false, totalCoins: 0 };
    }

    const claimed = await claimStripeSession(session.id, { userId, packageId: quoteId });
    if (!claimed) {
      return { credited: true, totalCoins: 0, duplicate: true, kind: 'order_quote' };
    }

    await assertQuoteValidForPayment(quoteId, userId, expectedCents);
    if (session.amount_total != null && session.amount_total !== expectedCents) {
      throw new AppError(400, 'INVALID_INPUT', 'Stripe-Betrag stimmt nicht mit Quote überein');
    }
    const result = await creditStripeOrderPayment(
      userId,
      expectedCents,
      session.id,
      quoteId,
      'stripe-webhook'
    );
    return {
      credited: true,
      totalCoins: 0,
      newBalance: result.balance.balanceCents,
      duplicate: result.duplicate,
      kind: 'order_quote',
    };
  }

  const packageId = session.metadata?.packageId;
  if (!packageId) {
    return { credited: false, totalCoins: 0 };
  }

  return creditCoinsFromPackagePurchase({
    provider: 'stripe',
    paymentId: session.id,
    userId,
    packageId,
    amountCents: session.amount_total ?? undefined,
  });
}

stripeRoutes.post(
  '/checkout',
  authenticate,
  requirePermission(Permission.PURCHASE_COINS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { packageId } = checkoutSchema.parse(req.body);

    if (!isStripeConfigured()) {
      if (isDevAuthEnabled()) {
        throw new AppError(
          503,
          'STRIPE_NOT_CONFIGURED',
          'Stripe nicht konfiguriert – nutze Dev-Kauf unter /stripe/dev-purchase (nur Entwicklung)'
        );
      }
      throw new AppError(503, 'STRIPE_NOT_CONFIGURED', 'Stripe ist nicht konfiguriert');
    }

    const session = await createCheckoutSession(req.user!.uid, req.user!.email, packageId);
    sendSuccess(res, session);
  })
);

stripeRoutes.post(
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
      message: 'Dev-Kauf erfolgreich – Stripe simuliert',
    });
  })
);

stripeRoutes.post(
  '/verify-session',
  authenticate,
  requirePermission(Permission.PURCHASE_COINS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!isStripeConfigured()) {
      throw new AppError(503, 'STRIPE_NOT_CONFIGURED', 'Stripe ist nicht konfiguriert');
    }

    const { sessionId } = verifySessionSchema.parse(req.body);
    const session = await retrieveCheckoutSession(sessionId);

    if (session.metadata?.userId && session.metadata.userId !== req.user!.uid) {
      throw new AppError(403, 'FORBIDDEN', 'Diese Zahlung gehört nicht zu deinem Konto');
    }

    const result = await processCheckoutSession(session);

    sendSuccess(res, {
      credited: result.credited,
      duplicate: result.duplicate ?? false,
      coinsAdded: result.totalCoins,
      newBalance: result.newBalance,
      kind: result.kind,
    });
  })
);

stripeRoutes.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = await constructWebhookEvent(req.body, signature);
    } catch (err) {
      console.error('[Stripe] Webhook signature verification failed:', err);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await processCheckoutSession(session);

      if (!result.credited && !result.duplicate && session.payment_status !== 'paid') {
        res.json({ received: true, skipped: true });
        return;
      }

      if (result.duplicate) {
        res.json({ received: true, duplicate: true });
        return;
      }
    }

    res.json({ received: true });
  })
);
