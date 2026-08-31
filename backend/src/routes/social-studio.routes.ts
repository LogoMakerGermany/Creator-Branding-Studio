import { Router } from 'express';
import { z } from 'zod';
import { Permission, type BannerPlatform } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createQuote } from '../services/nexter/quotes.service.js';

export const socialStudioRoutes = Router();
socialStudioRoutes.use(authenticate, requirePermission(Permission.MANAGE_SOCIAL));

const FORMAT_PLATFORM: Record<string, BannerPlatform> = {
  thumbnail: 'youtube',
  post: 'instagram',
  story: 'tiktok',
  announcement: 'discord',
};

socialStudioRoutes.post(
  '/quote',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        format: z.enum(['thumbnail', 'post', 'story', 'announcement']),
        projectId: z.string().max(80).optional(),
      })
      .parse(req.body);
    const quote = await createQuote(req.user!.uid, 'banner', body.projectId, {
      socialFormat: body.format,
      platform: FORMAT_PLATFORM[body.format],
    });
    sendSuccess(res, { quote });
  })
);

socialStudioRoutes.post(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    throw new AppError(
      400,
      'SOCIAL_GRAPHIC_REQUIRES_QUOTE',
      'Social-Grafik startet nur nach Angebot und Bestätigung (Erstellen). Es ist Banner-Generierung, kein Social-Publishing.'
    );
  })
);
