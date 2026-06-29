import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import {
  listMarketplaceItems,
  getMarketplaceItem,
  listPurchases,
  purchaseItem,
  getPurchasedDownloadUrl,
  createListing,
  listUserListings,
  deactivateListing,
} from '../services/marketplace.service.js';

export const marketplaceRoutes = Router();
marketplaceRoutes.use(authenticate, requirePermission(Permission.BUY_MARKETPLACE));

function mapMarketplaceError(err: unknown): never {
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message);
  }
  const msg = err instanceof Error ? err.message : 'Marketplace-Fehler';
  throw new AppError(400, 'MARKETPLACE_ERROR', msg);
}

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
  previewDataUrl: z.string().min(20),
  assetDataUrl: z.string().min(20),
  tags: z.array(z.string()).optional(),
});

marketplaceRoutes.post(
  '/listings',
  requirePermission(Permission.SELL_MARKETPLACE),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = listingSchema.parse(req.body);
    try {
      const item = await createListing(req.user!.uid, body);
      sendSuccess(res, { item }, 201);
    } catch (err) {
      mapMarketplaceError(err);
    }
  })
);

marketplaceRoutes.delete(
  '/listings/:id',
  requirePermission(Permission.SELL_MARKETPLACE),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const item = await deactivateListing(req.user!.uid, String(req.params.id));
      sendSuccess(res, { item });
    } catch (err) {
      mapMarketplaceError(err);
    }
  })
);

marketplaceRoutes.post(
  '/:id/purchase',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const result = await purchaseItem(req.user!.uid, String(req.params.id));
      sendSuccess(res, result, 201);
    } catch (err) {
      mapMarketplaceError(err);
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
