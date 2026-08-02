import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  assertQuoteValidForPayment,
  createPriceQuote,
  listActivePriceComponents,
  toPublicQuote,
} from '../services/pricing.service.js';
import {
  chargeOrderFromBalance,
  getUserBalanceCents,
  listLedgerEntries,
} from '../services/ledger.service.js';
import { createQuoteCheckoutSession, isStripeConfigured } from '../services/stripe.service.js';
import { arePaymentsEnabled } from '../config/env.js';
import { getSystemSettings } from '../services/system-settings.service.js';

export const pricingRoutes = Router();

pricingRoutes.get(
  '/components',
  authenticate,
  asyncHandler(async (_req, res) => {
    const components = await listActivePriceComponents();
    sendSuccess(res, {
      components: components.map((c) => ({
        code: c.code,
        category: c.category,
        displayName: c.displayName,
        description: c.description,
        priceCents: c.priceCents,
        pricingVersion: c.pricingVersion,
      })),
    });
  })
);

pricingRoutes.post(
  '/quote',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      componentCodes: z.array(z.string().min(1)).min(1),
      quantities: z.record(z.string(), z.number().int().positive()).optional(),
    });
    const body = schema.parse(req.body);
    const quote = await createPriceQuote(req.user!.uid, body);
    sendSuccess(res, quote, 201);
  })
);

pricingRoutes.post(
  '/pay-with-balance',
  authenticate,
  requirePermission(Permission.PURCHASE_COINS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      quoteId: z.string().uuid(),
    });
    const { quoteId } = schema.parse(req.body);
    const settings = await getSystemSettings();
    if (!settings.paymentsEnabled || !arePaymentsEnabled()) {
      throw new AppError(503, 'PAYMENT_FAILED', 'Zahlungen sind derzeit deaktiviert');
    }

    const quote = await assertQuoteValidForPayment(quoteId, req.user!.uid);
    const result = await chargeOrderFromBalance(
      req.user!.uid,
      quote.totalCents,
      quote.quoteId,
      req.user!.uid
    );

    sendSuccess(res, {
      quote: toPublicQuote(quote),
      paymentStatus: 'paid',
      ledgerEntryId: result.entry.id,
      balance: result.balance,
      duplicate: result.duplicate,
    });
  })
);

pricingRoutes.post(
  '/checkout',
  authenticate,
  requirePermission(Permission.PURCHASE_COINS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      quoteId: z.string().uuid(),
    });
    const { quoteId } = schema.parse(req.body);
    const settings = await getSystemSettings();
    if (!settings.paymentsEnabled || !arePaymentsEnabled()) {
      throw new AppError(503, 'PAYMENT_FAILED', 'Zahlungen sind derzeit deaktiviert');
    }
    if (!isStripeConfigured()) {
      throw new AppError(503, 'PAYMENT_FAILED', 'Stripe ist nicht konfiguriert');
    }

    const quote = await assertQuoteValidForPayment(quoteId, req.user!.uid);
    const session = await createQuoteCheckoutSession(
      req.user!.uid,
      req.user!.email,
      quote.quoteId,
      quote.totalCents,
      quote.lineItems.map((li: { displayName: string }) => li.displayName).join(', ')
    );

    sendSuccess(res, {
      quote: toPublicQuote(quote),
      checkoutUrl: session.url,
      sessionId: session.sessionId,
    });
  })
);

export const balanceRoutes = Router();

balanceRoutes.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const balance = await getUserBalanceCents(req.user!.uid);
    sendSuccess(res, { balance });
  })
);

balanceRoutes.get(
  '/ledger',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const entries = await listLedgerEntries(req.user!.uid);
    sendSuccess(res, { entries });
  })
);
