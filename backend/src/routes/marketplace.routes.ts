import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listMarketplaceItems,
  getMarketplaceItem,
  listPurchases,
  purchaseItem,
  getPurchasedDownloadUrl,
  createListing,
  listUserListings,
} from '../services/marketplace.service.js';

export const marketplaceRoutes = Router();
marketplaceRoutes.use(authenticate, requirePermission(Permission.BUY_MARKETPLACE));

marketplaceRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const category = req.query.category as string | undefined;
    const items = await listMarketplaceItems(category as Parameters<typeof listMarketplaceItems>[0]);
    const purchases = await listPurchases(req.user!.uid);
    sendSuccess(res, { items, purchases, purchasedIds: purchases.map((p) => p.itemId) });
  })
);

marketplaceRoutes.get(
  '/purchases',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const purchases = await listPurchases(req.user!.uid);
    const items = (await Promise.all(purchases.map((p) => getMarketplaceItem(p.itemId)))).filter(Boolean);
    sendSuccess(res, { purchases, items });
  })
);

marketplaceRoutes.get(
  '/my-listings',
  requirePermission(Permission.SELL_MARKETPLACE),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const items = await listUserListings(req.user!.uid);
    sendSuccess(res, { items });
  })
);

const listingSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(2).max(500),
  category: z.enum(['logo', 'banner', 'template', 'intro', 'overlay', 'emote', 'sound', 'panel', 'vtuber']),
  priceCoins: z.number().int().min(5).max(500),
  previewUrl: z.string().min(10).optional(),
  downloadUrl: z.string().min(10).optional(),
  tags: z.array(z.string()).optional(),
});

marketplaceRoutes.post(
  '/listings',
  requirePermission(Permission.SELL_MARKETPLACE),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = listingSchema.parse(req.body);
    const item = await createListing(req.user!.uid, body);
    sendSuccess(res, { item }, 201);
  })
);

marketplaceRoutes.post(
  '/:id/purchase',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const result = await purchaseItem(req.user!.uid, String(req.params.id));
      sendSuccess(res, result, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kauf fehlgeschlagen';
      if (msg.includes('Coins')) throw new AppError(402, 'INSUFFICIENT_COINS', msg);
      throw new AppError(400, 'PURCHASE_FAILED', msg);
    }
  })
);

marketplaceRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const downloadUrl = await getPurchasedDownloadUrl(req.user!.uid, String(req.params.id));
    if (!downloadUrl) throw new AppError(403, 'FORBIDDEN', 'Kauf erforderlich');
    sendSuccess(res, { downloadUrl });
  })
);

marketplaceRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const item = await getMarketplaceItem(String(req.params.id));
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Artikel nicht gefunden');
    sendSuccess(res, { item });
  })
);
