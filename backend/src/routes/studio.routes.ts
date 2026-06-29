import { Router } from 'express';
import { z } from 'zod';
import {
  Permission,
  CoinSpendCategory,
  BANNER_PLATFORM_SPECS,
  type BannerPlatform,
  type StudioModuleKey,
} from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { generateStudioAsset, getJobsByUser } from '../services/ai.service.js';

type StudioRouteConfig = {
  moduleName: string;
  moduleKey: StudioModuleKey;
  permission: Permission;
  coinCategory: CoinSpendCategory;
};

function createStudioRoutes(config: StudioRouteConfig) {
  const { moduleName, moduleKey, permission, coinCategory } = config;
  const router = Router();
  router.use(authenticate, requirePermission(permission));

  router.get(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const jobs = await getJobsByUser(req.user!.uid);
      const projects = jobs
        .filter((j) => j.module === moduleKey)
        .map((j) => ({
          id: j.id,
          status: j.status,
          imageUrl: j.imageUrl,
          exports: j.exports,
          provider: j.provider,
          error: j.error,
          createdAt: j.createdAt,
          completedAt: j.completedAt,
        }));
      sendSuccess(res, { module: moduleName, projects });
    })
  );

  const logoSchema = z.object({
    logoName: z.string().max(80).optional(),
    clanName: z.string().max(80).optional(),
    slogan: z.string().max(120).optional(),
    style: z.string().max(40).optional(),
    game: z.string().max(60).optional(),
    platform: z.string().max(40).optional(),
    ringLogo: z.boolean().optional(),
    transparentBackground: z.boolean().optional(),
    threeD: z.boolean().optional(),
    realistic: z.boolean().optional(),
    cartoon: z.boolean().optional(),
    anime: z.boolean().optional(),
    neon: z.boolean().optional(),
    ultraCinematic: z.boolean().optional(),
    customColors: z.array(z.string()).max(6).optional(),
  });

  const bannerSchema = z.object({
    platform: z.enum(Object.keys(BANNER_PLATFORM_SPECS) as [BannerPlatform, ...BannerPlatform[]]),
    title: z.string().max(80).optional(),
    subtitle: z.string().max(120).optional(),
    style: z.string().max(40).optional(),
  });

  const facecamSchema = z.object({
    style: z.string().max(40).optional(),
    shape: z.enum(['rectangle', 'circle', 'hexagon']).optional(),
    animated: z.boolean().optional(),
    transparentBackground: z.boolean().optional(),
  });

  const overlaySchema = z.object({
    style: z.string().max(40).optional(),
    overlayType: z.enum(['hud', 'alert', 'panel', 'starting-soon', 'brb', 'full-scene']).optional(),
    transparentBackground: z.boolean().optional(),
    animated: z.boolean().optional(),
  });

  const stickerSchema = z.object({
    name: z.string().max(80).optional(),
    style: z.string().max(40).optional(),
    multicolor: z.boolean().optional(),
    shape: z.enum(['circle', 'square', 'die-cut']).optional(),
    transparentBackground: z.boolean().optional(),
  });

  router.post(
    '/generate',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const studioOptions =
        moduleKey === 'logo'
          ? logoSchema.parse(req.body)
          : moduleKey === 'banner'
            ? bannerSchema.parse(req.body)
            : moduleKey === 'facecam'
              ? facecamSchema.parse(req.body)
              : moduleKey === 'overlay'
                ? overlaySchema.parse(req.body)
                : stickerSchema.parse(req.body);

      const result = await generateStudioAsset(
        req.user!.uid,
        moduleKey,
        coinCategory,
        moduleName,
        studioOptions
      );

      sendSuccess(
        res,
        {
          module: moduleName,
          jobId: result.job.id,
          status: result.job.status,
          imageUrl: result.job.imageUrl,
          exports: result.job.exports,
          provider: result.job.provider,
          error: result.job.error,
          dnaId: result.job.dnaId,
          coinsSpent: result.coinsSpent,
          newBalance: result.newBalance,
        },
        201
      );
    })
  );

  return router;
}

export const logoRoutes = createStudioRoutes({
  moduleName: 'logo-studio',
  moduleKey: 'logo',
  permission: Permission.USE_LOGO_STUDIO,
  coinCategory: CoinSpendCategory.LOGO_GENERATION,
});

export const bannerRoutes = createStudioRoutes({
  moduleName: 'banner-studio',
  moduleKey: 'banner',
  permission: Permission.USE_BANNER_STUDIO,
  coinCategory: CoinSpendCategory.BANNER_GENERATION,
});

export const facecamRoutes = createStudioRoutes({
  moduleName: 'facecam-studio',
  moduleKey: 'facecam',
  permission: Permission.USE_FACECAM_STUDIO,
  coinCategory: CoinSpendCategory.FACECAM_GENERATION,
});

export const overlayRoutes = createStudioRoutes({
  moduleName: 'overlay-studio',
  moduleKey: 'overlay',
  permission: Permission.USE_OVERLAY_STUDIO,
  coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
});

export const stickerRoutes = createStudioRoutes({
  moduleName: 'sticker-studio',
  moduleKey: 'sticker',
  permission: Permission.USE_STICKER_STUDIO,
  coinCategory: CoinSpendCategory.STICKER_GENERATION,
});
