import { Router } from 'express';
import { z } from 'zod';
import {
  Permission,
  CoinSpendCategory,
  BANNER_PLATFORM_SPECS,
  FACECAM_PLATFORM_SPECS,
  FACECAM_FRAME_SHAPES,
  FACECAM_FRAME_THICKNESSES,
  FACECAM_ASPECT_OPTIONS,
  type BannerPlatform,
  type FacecamPlatform,
  type StudioModuleKey,
} from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getJobsByUser } from '../services/ai.service.js';
import {
  applyLogoToCreatorDna,
  downloadLogo,
  getLogo,
  listLogo,
  listLogoVersions,
  retryLogoJob,
} from '../services/logo.service.js';
import {
  downloadBanner,
  getBanner,
  listBanner,
  listBannerVersions,
  retryBannerJob,
} from '../services/banner.service.js';
import {
  downloadFacecam,
  getFacecam,
  listFacecam,
  listFacecamVersions,
  retryFacecamJob,
} from '../services/facecam.service.js';
import {
  downloadOverlay,
  getOverlay,
  listOverlay,
  listOverlayVersions,
  retryOverlayJob,
} from '../services/overlay.service.js';
import {
  downloadSticker,
  getSticker,
  listSticker,
  listStickerVersions,
  retryStickerJob,
} from '../services/sticker.service.js';

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
      if (moduleKey === 'logo') {
        const logos = await listLogo(req.user!.uid);
        sendSuccess(res, {
          module: moduleName,
          projects: logos.map((j) => ({
            id: j.id,
            status: j.status,
            imageUrl: j.previewUrl || j.imageUrl,
            exports: j.exports,
            provider: j.provider,
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            fileId: j.fileId,
            width: j.width,
            height: j.height,
            mimeType: j.mimeType,
            version: j.version,
            downloadName: j.downloadName,
            fileMissing: j.fileMissing,
          })),
        });
        return;
      }
      if (moduleKey === 'banner') {
        const banners = await listBanner(req.user!.uid);
        sendSuccess(res, {
          module: moduleName,
          projects: banners.map((j) => ({
            id: j.id,
            status: j.status,
            imageUrl: j.previewUrl || j.imageUrl,
            exports: j.exports,
            provider: j.provider,
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            fileId: j.fileId,
            width: j.width,
            height: j.height,
            mimeType: j.mimeType,
            version: j.version,
            downloadName: j.downloadName,
            fileMissing: j.fileMissing,
            platform: j.platform,
          })),
        });
        return;
      }
      if (moduleKey === 'facecam') {
        const facecams = await listFacecam(req.user!.uid);
        sendSuccess(res, {
          module: moduleName,
          projects: facecams.map((j) => ({
            id: j.id,
            status: j.status,
            imageUrl: j.previewUrl || j.imageUrl,
            exports: j.exports,
            provider: j.provider,
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            fileId: j.fileId,
            width: j.width,
            height: j.height,
            mimeType: j.mimeType,
            version: j.version,
            downloadName: j.downloadName,
            fileMissing: j.fileMissing,
            platform: j.platform,
            transparentBackground: j.transparentBackground ?? j.config?.transparentBackground,
            frameShape: j.config?.frameShape,
            aspectRatio: j.config?.aspectRatio,
          })),
        });
        return;
      }
      if (moduleKey === 'overlay') {
        const overlays = await listOverlay(req.user!.uid);
        sendSuccess(res, {
          module: moduleName,
          projects: overlays.map((j) => ({
            id: j.id,
            status: j.status,
            imageUrl: j.previewUrl || j.imageUrl,
            exports: j.exports,
            provider: j.provider,
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            fileId: j.fileId,
            width: j.width,
            height: j.height,
            mimeType: j.mimeType,
            version: j.version,
            downloadName: j.downloadName,
            fileMissing: j.fileMissing,
            platform: j.platform,
            transparentBackground: j.transparentBackground ?? j.config?.transparentBackground,
            aspectRatio: j.config?.aspectRatio,
            layoutPreset: j.config?.layoutPreset,
          })),
        });
        return;
      }
      if (moduleKey === 'sticker') {
        const stickers = await listSticker(req.user!.uid);
        sendSuccess(res, {
          module: moduleName,
          projects: stickers.map((j) => ({
            id: j.id,
            status: j.status,
            imageUrl: j.previewUrl || j.imageUrl,
            exports: j.exports,
            provider: j.provider,
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            fileId: j.fileId,
            width: j.width,
            height: j.height,
            mimeType: j.mimeType,
            version: j.version,
            downloadName: j.downloadName,
            fileMissing: j.fileMissing,
            platform: j.platform,
            transparentBackground: j.transparentBackground ?? j.config?.transparentBackground,
            stickerType: j.config?.kind,
          })),
        });
        return;
      }
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

  const logoFields = z
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
    .passthrough();

  const bannerSchema = z.object({
    platform: z.enum(Object.keys(BANNER_PLATFORM_SPECS) as [BannerPlatform, ...BannerPlatform[]]),
    title: z.string().max(80).optional(),
    subtitle: z.string().max(120).optional(),
    style: z.string().max(40).optional(),
    projectId: z.string().min(1).max(80).optional(),
  });

  const facecamSchema = z.object({
    style: z.string().max(40).optional(),
    shape: z.enum(FACECAM_FRAME_SHAPES as [string, ...string[]]).optional(),
    frameShape: z.enum(FACECAM_FRAME_SHAPES as [string, ...string[]]).optional(),
    frameThickness: z.enum(FACECAM_FRAME_THICKNESSES as [string, ...string[]]).optional(),
    platform: z.enum(Object.keys(FACECAM_PLATFORM_SPECS) as [FacecamPlatform, ...FacecamPlatform[]]).optional(),
    aspectRatio: z.enum(FACECAM_ASPECT_OPTIONS as [string, ...string[]]).optional(),
    animated: z.boolean().optional(),
    transparentBackground: z.boolean().optional(),
    transparentCenter: z.boolean().optional(),
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
        logoFields.partial().parse(req.body ?? {});
        throw new AppError(
          400,
          'LOGO_REQUIRES_QUOTE',
          'Logo startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
        );
      }

      if (moduleKey === 'banner') {
        bannerSchema.partial().parse(req.body ?? {});
        throw new AppError(
          400,
          'BANNER_REQUIRES_QUOTE',
          'Banner startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
        );
      }

      if (moduleKey === 'facecam') {
        facecamSchema.partial().parse(req.body ?? {});
        throw new AppError(
          400,
          'FACECAM_REQUIRES_QUOTE',
          'Facecam startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
        );
      }

      if (moduleKey === 'overlay') {
        overlaySchema.partial().parse(req.body ?? {});
        throw new AppError(
          400,
          'OVERLAY_REQUIRES_QUOTE',
          'Overlay startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
        );
      }

      if (moduleKey === 'sticker') {
        stickerSchema.partial().parse(req.body ?? {});
        throw new AppError(
          400,
          'STICKER_REQUIRES_QUOTE',
          'Sticker startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
        );
      }

      throw new AppError(400, 'STUDIO_REQUIRES_QUOTE', 'Generierung startet nur über Nexter nach Bestätigung.');
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

logoRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await downloadLogo(String(req.params.id), req.user!.uid));
  })
);

logoRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { versions: await listLogoVersions(String(req.params.id), req.user!.uid) });
  })
);

logoRoutes.post(
  '/:id/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await retryLogoJob(String(req.params.id), req.user!.uid);
    sendSuccess(res, {});
  })
);

logoRoutes.post(
  '/:id/apply-dna',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ confirm: z.boolean().optional() }).parse(req.body ?? {});
    const dna = await applyLogoToCreatorDna(String(req.params.id), req.user!.uid, { confirm: body.confirm === true });
    sendSuccess(res, { dna });
  })
);

logoRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getLogo(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Logo nicht gefunden');
    sendSuccess(res, { job });
  })
);

export const bannerRoutes = createStudioRoutes({
  moduleName: 'banner-studio',
  moduleKey: 'banner',
  permission: Permission.USE_BANNER_STUDIO,
  coinCategory: CoinSpendCategory.BANNER_GENERATION,
});

bannerRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await downloadBanner(String(req.params.id), req.user!.uid));
  })
);

bannerRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { versions: await listBannerVersions(String(req.params.id), req.user!.uid) });
  })
);

bannerRoutes.post(
  '/:id/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await retryBannerJob(String(req.params.id), req.user!.uid);
    sendSuccess(res, {});
  })
);

bannerRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getBanner(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Banner nicht gefunden');
    sendSuccess(res, { job });
  })
);

export const facecamRoutes = createStudioRoutes({
  moduleName: 'facecam-studio',
  moduleKey: 'facecam',
  permission: Permission.USE_FACECAM_STUDIO,
  coinCategory: CoinSpendCategory.FACECAM_GENERATION,
});

facecamRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await downloadFacecam(String(req.params.id), req.user!.uid));
  })
);

facecamRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { versions: await listFacecamVersions(String(req.params.id), req.user!.uid) });
  })
);

facecamRoutes.post(
  '/:id/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await retryFacecamJob(String(req.params.id), req.user!.uid);
    sendSuccess(res, {});
  })
);

facecamRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getFacecam(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Facecam nicht gefunden');
    sendSuccess(res, { job });
  })
);

export const overlayRoutes = createStudioRoutes({
  moduleName: 'overlay-studio',
  moduleKey: 'overlay',
  permission: Permission.USE_OVERLAY_STUDIO,
  coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
});

overlayRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await downloadOverlay(String(req.params.id), req.user!.uid));
  })
);

overlayRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { versions: await listOverlayVersions(String(req.params.id), req.user!.uid) });
  })
);

overlayRoutes.post(
  '/:id/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await retryOverlayJob(String(req.params.id), req.user!.uid);
    sendSuccess(res, {});
  })
);

overlayRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getOverlay(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Overlay nicht gefunden');
    sendSuccess(res, { job });
  })
);

export const stickerRoutes = createStudioRoutes({
  moduleName: 'sticker-studio',
  moduleKey: 'sticker',
  permission: Permission.USE_STICKER_STUDIO,
  coinCategory: CoinSpendCategory.STICKER_GENERATION,
});

stickerRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await downloadSticker(String(req.params.id), req.user!.uid));
  })
);

stickerRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { versions: await listStickerVersions(String(req.params.id), req.user!.uid) });
  })
);

stickerRoutes.post(
  '/:id/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await retryStickerJob(String(req.params.id), req.user!.uid);
    sendSuccess(res, {});
  })
);

stickerRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getSticker(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Sticker nicht gefunden');
    sendSuccess(res, { job });
  })
);
