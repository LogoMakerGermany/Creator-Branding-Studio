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
import { buildBrandingModulePrompt, getJobsByUser, runGenerationJob } from '../services/ai.service.js';
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
    const schema = z.object({
      displayName: z.string().min(1).max(100).optional(),
      authProvider: z
        .enum([
          'google',
          'discord',
          'twitch',
          'tiktok',
          'github',
          'apple',
          'microsoft',
          'email',
        ])
        .optional(),
    });
    const body = schema.parse(req.body);

    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email,
      body.displayName || req.user!.displayName,
      body.authProvider
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
      packModules.map(async (module) => {
        const prompt = buildBrandingModulePrompt(activeDna, module);
        const hd = ['profile-pic', 'banner', 'overlay', 'stream-start', 'stream-end'].includes(module);
        const size = module === 'banner' ? '1792x1024' : moduleImageSizeForPack(module);
        return runGenerationJob(req.user!.uid, module, activeDna, prompt, { size, hd });
      })
    );

    const failed = jobs.filter((j) => j.status === 'failed');
    if (failed.length === jobs.length) {
      throw new AppError(503, 'AI_GENERATION_FAILED', 'Branding-Paket konnte nicht generiert werden');
    }

    sendSuccess(
      res,
      {
        jobId: jobs[0]?.id ?? `branding_${Date.now()}`,
        status: failed.length ? 'partial' : 'completed',
        dnaId: activeDna.id,
        jobs,
        failedCount: failed.length,
        coinsSpent: coinResult.cost,
        newBalance: coinResult.newBalance,
      },
      201
    );
  })
);

function moduleImageSizeForPack(module: string): '1024x1024' | '1792x1024' | '1024x1792' {
  if (['banner', 'stream-start', 'stream-end', 'panel', 'overlay'].includes(module)) {
    return '1792x1024';
  }
  return '1024x1024';
}
