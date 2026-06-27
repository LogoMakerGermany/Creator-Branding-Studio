import { Router } from 'express';
import { z } from 'zod';
import { Permission, CoinSpendCategory } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getOrCreateUser, getUserById, updateUser } from '../services/user.service.js';
import { getActiveDna } from '../services/dna.service.js';
import { deductCoins } from '../services/coins.service.js';
import { generateStudioAsset, runGenerationJob, getJobsByUser } from '../services/ai.service.js';
import { listLayouts } from '../services/layout.service.js';
import { listUserFiles } from '../services/file-cloud.service.js';
import { randomUUID } from 'node:crypto';
import { isProduction, isDevAuthEnabled } from '../config/env.js';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { message: 'Nutze Firebase Auth – Token an /auth/me senden' });
  })
);

authRoutes.post(
  '/sync',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { displayName, authProvider } = req.body as {
      displayName?: string;
      authProvider?: string;
    };

    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email,
      displayName || req.user!.displayName,
      authProvider
    );

    sendSuccess(res, { user }, 201);
  })
);

authRoutes.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await getUserById(req.user!.uid);
    const activeDna = await getActiveDna(req.user!.uid);
    sendSuccess(res, { user, activeDna });
  })
);

authRoutes.patch(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      displayName: z.string().min(1).max(100).optional(),
      locale: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const user = await updateUser(req.user!.uid, body);
    sendSuccess(res, { user });
  })
);

authRoutes.post(
  '/onboarding/complete',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await updateUser(req.user!.uid, { onboardingCompleted: true });
    sendSuccess(res, { user });
  })
);

// Dev-only login endpoint
authRoutes.post(
  '/dev-login',
  asyncHandler(async (req, res) => {
    if (isProduction() || !isDevAuthEnabled()) {
      throw new AppError(403, 'FORBIDDEN', 'Dev-Login ist in Production deaktiviert');
    }

    const { email, displayName } = req.body as { email?: string; displayName?: string };
    const uid = randomUUID();
    const userEmail = email || `dev-${uid.slice(0, 8)}@ucbs.local`;

    const user = await getOrCreateUser(uid, userEmail, displayName || 'Dev Creator', 'dev');
    sendSuccess(res, {
      token: `dev_${uid}`,
      user,
    });
  })
);

authRoutes.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const jobs = await getJobsByUser(userId);
    sendSuccess(res, {
      generations: jobs.filter((j) => j.status === 'completed').length,
      projects: (await listLayouts(userId)).length,
      files: (await listUserFiles(userId)).length,
    });
  })
);

function buildStudioPrompt(
  moduleKey: 'logo' | 'banner' | 'facecam',
  style?: string,
  platform?: string
): string | undefined {
  if (!style && !platform) return undefined;
  if (moduleKey === 'logo' && style) {
    return `Create a ${style} style logo design with strong visual identity`;
  }
  if (moduleKey === 'banner' && (platform || style)) {
    return `Create a ${platform || style} platform header banner with correct proportions`;
  }
  if (moduleKey === 'facecam' && style) {
    return `Create a ${style} style facecam overlay frame for live streaming`;
  }
  return style ? `${style} style` : undefined;
}

function createStudioRoutes(
  moduleName: string,
  permission: Permission,
  coinCategory: CoinSpendCategory
) {
  const router = Router();
  router.use(authenticate, requirePermission(permission));

  router.get(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      sendSuccess(res, { module: moduleName, projects: [] });
    })
  );

  router.post(
    '/generate',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const moduleMap: Record<string, 'logo' | 'banner' | 'facecam'> = {
        'logo-studio': 'logo',
        'banner-studio': 'banner',
        'facecam-studio': 'facecam',
      };
      const moduleKey = moduleMap[moduleName] ?? 'logo';
      const { style, platform } = req.body as { style?: string; platform?: string };
      const customPrompt = buildStudioPrompt(moduleKey, style, platform);

      const result = await generateStudioAsset(
        req.user!.uid,
        moduleKey,
        coinCategory,
        moduleName,
        customPrompt
      );

      sendSuccess(
        res,
        {
          module: moduleName,
          jobId: result.job.id,
          status: result.job.status,
          imageUrl: result.job.imageUrl,
          provider: result.job.provider,
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

export const logoRoutes = createStudioRoutes(
  'logo-studio',
  Permission.USE_LOGO_STUDIO,
  CoinSpendCategory.LOGO_GENERATION
);

export const bannerRoutes = createStudioRoutes(
  'banner-studio',
  Permission.USE_BANNER_STUDIO,
  CoinSpendCategory.BANNER_GENERATION
);

export const facecamRoutes = createStudioRoutes(
  'facecam-studio',
  Permission.USE_FACECAM_STUDIO,
  CoinSpendCategory.BANNER_GENERATION
);

export const brandingRoutes = Router();
brandingRoutes.use(authenticate, requirePermission(Permission.USE_BANNER_STUDIO));

brandingRoutes.post(
  '/generate-pack',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) {
      throw new AppError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    }

    const coinResult = await deductCoins(
      req.user!.uid,
      CoinSpendCategory.BRANDING_PACK,
      'Branding-Paket Generierung'
    );

    if (!coinResult.success) {
      throw new AppError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');
    }

    const packModules = [
      'profile-pic',
      'banner',
      'facecam',
      'overlay',
      'stream-start',
      'stream-end',
      'panel',
      'alert',
    ] as const;

    const jobs = await Promise.all(
      packModules.map((module) => runGenerationJob(req.user!.uid, module, activeDna))
    );

    sendSuccess(res, {
      jobId: `branding_${Date.now()}`,
      status: 'completed',
      dnaId: activeDna.id,
      jobs,
      coinsSpent: coinResult.cost,
      newBalance: coinResult.newBalance,
    }, 201);
  })
);
