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
import { generateStudioAsset, generateMagikLogoPair, getJobsByUser } from '../services/ai.service.js';

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

  const logoSchema = z
    .object({
      logoName: z.string().min(2).max(80),
      clanName: z.string().max(80).optional(),
      slogan: z.string().max(120).optional(),
      game: z.string().max(60).optional(),
      platform: z.string().max(40).optional(),
      magikMode: z.enum(['name', 'character']).optional(),
      magikCharacter: z.string().max(60).optional(),
      customCharacter: z.string().max(120).optional(),
      magikStyle: z.string().max(40).optional(),
      magikLogoArt: z.enum(['2d', '3d', 'ultra-3d', 'ultra-cinematic-3d']).optional(),
      ringLogoMode: z.enum(['yes', 'no', 'auto']).optional(),
      magikBackground: z.string().max(30).optional(),
      selectedColors: z.array(z.string()).max(6).optional(),
      primaryColor: z.string().max(20).optional(),
      secondaryColor: z.string().max(20).optional(),
      accentColor: z.string().max(20).optional(),
      customPromptOverride: z.string().max(4000).optional(),
      transparentBackground: z.boolean().optional(),
      symbol: z.string().max(120).optional(),
      style: z.string().max(40).optional(),
      dimension: z.enum(['2d', '3d']).optional(),
      ringLogo: z.boolean().optional(),
      backgroundType: z.string().optional(),
      backgroundColor: z.string().max(20).optional(),
      customColors: z.array(z.string()).max(6).optional(),
      threeD: z.boolean().optional(),
      realistic: z.boolean().optional(),
      cartoon: z.boolean().optional(),
      anime: z.boolean().optional(),
      neon: z.boolean().optional(),
      ultraCinematic: z.boolean().optional(),
      logoBackground: z.string().max(30).optional(),
      logoBackgroundUploadName: z.string().max(200).optional(),
      logoBackgroundUpload: z.string().max(7_000_000).optional(),
      projectId: z.string().min(1).max(80).optional(),
    })
    .passthrough()
    .superRefine((data, ctx) => {
      const colors =
        data.selectedColors?.length ||
        data.primaryColor ||
        data.secondaryColor ||
        data.accentColor ||
        (data.customColors && data.customColors.length > 0);
      if (!colors) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Mindestens eine Farbe erforderlich',
          path: ['selectedColors'],
        });
      }
      if (data.magikMode === 'character') {
        const hasChar =
          (data.magikCharacter && data.magikCharacter !== 'Eigene Figur') ||
          (data.magikCharacter === 'Eigene Figur' && data.customCharacter?.trim());
        if (!hasChar) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Figur erforderlich',
            path: ['magikCharacter'],
          });
        }
      }
    });

  const bannerSchema = z.object({
    platform: z.enum(Object.keys(BANNER_PLATFORM_SPECS) as [BannerPlatform, ...BannerPlatform[]]),
    title: z.string().max(80).optional(),
    subtitle: z.string().max(120).optional(),
    style: z.string().max(40).optional(),
    projectId: z.string().min(1).max(80).optional(),
  });

  const facecamSchema = z.object({
    style: z.string().max(40).optional(),
    shape: z.enum(['rectangle', 'circle', 'hexagon']).optional(),
    animated: z.boolean().optional(),
    transparentBackground: z.boolean().optional(),
    projectId: z.string().min(1).max(80).optional(),
  });

  const overlaySchema = z.object({
    style: z.string().max(40).optional(),
    overlayType: z.enum(['hud', 'alert', 'panel', 'starting-soon', 'brb', 'offline', 'ending', 'full-scene']).optional(),
    transparentBackground: z.boolean().optional(),
    animated: z.boolean().optional(),
    projectId: z.string().min(1).max(80).optional(),
  });

  const stickerSchema = z.object({
    name: z.string().max(80).optional(),
    style: z.string().max(40).optional(),
    multicolor: z.boolean().optional(),
    shape: z.enum(['circle', 'square', 'die-cut']).optional(),
    transparentBackground: z.boolean().optional(),
    projectId: z.string().min(1).max(80).optional(),
  });

  router.post(
    '/generate',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (moduleKey === 'logo') {
        const logoParsed = logoSchema.parse(req.body);
        const { projectId: logoProjectId, ...logoOptions } = logoParsed;
        const result = await generateMagikLogoPair(
          req.user!.uid,
          coinCategory,
          moduleName,
          logoOptions as import('@ucbs/shared').LogoGenerationOptions,
          { projectId: logoProjectId }
        );
        const [jobA, jobB] = result.jobs;
        sendSuccess(
          res,
          {
            module: moduleName,
            jobId: jobA.id,
            status: jobA.status,
            imageUrl: jobA.imageUrl,
            exports: jobA.exports,
            provider: jobA.provider,
            prompts: result.prompts,
            variants: [
              {
                variant: 'a',
                jobId: jobA.id,
                status: jobA.status,
                imageUrl: jobA.imageUrl,
                exports: jobA.exports,
                provider: jobA.provider,
                prompt: result.prompts.a,
                error: jobA.error,
              },
              {
                variant: 'b',
                jobId: jobB.id,
                status: jobB.status,
                imageUrl: jobB.imageUrl,
                exports: jobB.exports,
                provider: jobB.provider,
                prompt: result.prompts.b,
                error: jobB.error,
              },
            ],
            coinsSpent: result.coinsSpent,
            newBalance: result.newBalance,
          },
          201
        );
        return;
      }

      const studioOptions =
        moduleKey === 'banner'
          ? bannerSchema.parse(req.body)
          : moduleKey === 'facecam'
            ? facecamSchema.parse(req.body)
            : moduleKey === 'overlay'
              ? overlaySchema.parse(req.body)
              : stickerSchema.parse(req.body);

      const { projectId: studioProjectId, ...opts } = studioOptions as typeof studioOptions & { projectId?: string };

      const result = await generateStudioAsset(
        req.user!.uid,
        moduleKey,
        coinCategory,
        moduleName,
        opts,
        { projectId: studioProjectId }
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
