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

import { isDevAuthEnabled, isProduction } from '../config/env.js';



export const stripeRoutes = Router();



const checkoutSchema = z.object({

  packageId: z.enum(['starter', 'pro', 'ultimate']),

});



const verifySessionSchema = z.object({

  sessionId: z.string().min(1),

});



async function creditCoinsFromCheckoutSession(

  session: Stripe.Checkout.Session

): Promise<{ credited: boolean; totalCoins: number; newBalance?: number; duplicate?: boolean }> {

  if (session.payment_status !== 'paid') {

    return { credited: false, totalCoins: 0 };

  }



  const userId = session.metadata?.userId;

  const coins = parseInt(session.metadata?.coins || '0', 10);

  const bonusCoins = parseInt(session.metadata?.bonusCoins || '0', 10);

  const packageId = session.metadata?.packageId || 'unknown';



  return creditCoinsFromPackagePurchase({

    provider: 'stripe',

    paymentId: session.id,

    userId: userId || '',

    packageId,

    coins,

    bonusCoins,

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



    const session = await createCheckoutSession(

      req.user!.uid,

      req.user!.email,

      packageId

    );



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



    const result = await creditCoinsFromCheckoutSession(session);



    sendSuccess(res, {

      credited: result.credited,

      duplicate: result.duplicate ?? false,

      coinsAdded: result.totalCoins,

      newBalance: result.newBalance,

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



    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {

      const session = event.data.object as Stripe.Checkout.Session;

      const result = await creditCoinsFromCheckoutSession(session);



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

