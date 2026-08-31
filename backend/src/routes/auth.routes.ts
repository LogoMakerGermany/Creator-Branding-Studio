import { Router } from 'express';
import { z } from 'zod';
import { Permission, CoinSpendCategory, UserRole } from '@ucbs/shared';
import { authenticate, authenticateAllowUnprovisioned } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getOrCreateUser, getUserById, updateUser } from '../services/user.service.js';
import { getActiveDna } from '../services/dna.service.js';
import { buildBrandingModulePrompt, getJobsByUser, runGenerationJob } from '../services/ai.service.js';
import { listProjects } from '../services/project.service.js';
import { listUserFiles } from '../services/file-cloud.service.js';
import { getRegistrationMode } from '../services/system-settings.service.js';
import { redeemInviteCode, validateInviteCode } from '../services/invite.service.js';
import { randomUUID } from 'node:crypto';
import { isProduction, isDevAuthEnabled } from '../config/env.js';
import { withCoinChargePack } from '../lib/billable-job.js';
import { dispatchTransactionalEmail, welcomeEmail } from '../services/email.service.js';
import { exportAccountData, requestAccountDeletion } from '../services/account.service.js';

export const authRoutes = Router();

authRoutes.get(
  '/registration-status',
  asyncHandler(async (_req, res) => {
    const mode = await getRegistrationMode();
    sendSuccess(res, {
      registrationMode: mode,
      registrationOpen: mode !== 'closed',
      inviteRequired: mode === 'invite_only',
    });
  })
);

authRoutes.post(
  '/validate-invite',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      code: z.string().min(1).max(64),
      email: z.string().email().optional(),
    });
    const body = schema.parse(req.body);
    const result = await validateInviteCode(body.code, body.email);
    sendSuccess(res, result);
  })
);

authRoutes.post(
  '/register',
  asyncHandler(async (_req, res) => {
    const mode = await getRegistrationMode();
    sendSuccess(res, {
      message:
        mode === 'closed'
          ? 'Registrierung ist derzeit geschlossen'
          : mode === 'invite_only'
            ? 'Registrierung nur mit Einladungscode — Firebase Auth + POST /auth/sync'
            : 'Nutze Firebase Auth – Token und optional inviteCode an /auth/sync senden',
      registrationMode: mode,
    });
  })
);

authRoutes.post(
  '/sync',
  authenticateAllowUnprovisioned,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      displayName: z.string().min(1).max(100).optional(),
      inviteCode: z.string().min(1).max(64).optional(),
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
    const token = req.authToken!;
    const email = token.email;
    const uid = token.uid;

    const existing = await getUserById(uid);
    if (existing) {
      const user = await getOrCreateUser(uid, email, body.displayName || existing.displayName, {
        authProvider: body.authProvider,
      });
      sendSuccess(res, { user });
      return;
    }

    const mode = await getRegistrationMode();
    if (mode === 'closed') {
      throw new AppError(403, 'ACCESS_DENIED', 'Registrierung ist derzeit geschlossen');
    }

    let role = UserRole.USER;
    let inviteCodeId: string | undefined;

    if (mode === 'invite_only') {
      if (!body.inviteCode) {
        throw new AppError(
          403,
          'ACCESS_DENIED',
          'Einladungscode erforderlich — die Plattform ist derzeit nur mit Einladung zugänglich'
        );
      }
      const redeemed = await redeemInviteCode(body.inviteCode, email, uid);
      role = redeemed.grantRole === 'tester' ? UserRole.TESTER : UserRole.USER;
      inviteCodeId = redeemed.invite.id;
    }

    const user = await getOrCreateUser(uid, email, body.displayName || token.name, {
      authProvider: body.authProvider,
      role,
      inviteCodeId,
    });

    void dispatchTransactionalEmail(`welcome:${uid}`, welcomeEmail(user.email, user.displayName)).catch(
      () => undefined
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
    const body = z
      .object({
        displayName: z.string().min(1).max(100).optional(),
      })
      .parse(req.body ?? {});
    const patch: { onboardingCompleted: true; displayName?: string } = { onboardingCompleted: true };
    if (body.displayName) patch.displayName = body.displayName;
    const user = await updateUser(req.user!.uid, patch);
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
      projects: (await listProjects(userId)).length,
      files: (await listUserFiles(userId)).length,
    });
  })
);

authRoutes.get(
  '/export',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await exportAccountData(req.user!.uid);
    sendSuccess(res, { export: data });
  })
);

authRoutes.post(
  '/account/delete',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ confirmation: z.string().min(1) }).parse(req.body);
    const result = await requestAccountDeletion(req.user!.uid, body.confirmation);
    sendSuccess(res, result);
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

    const packModules = [
      'profile-pic',
      'banner',
      'facecam',
      'overlay',
      'stream-start',
      'stream-end',
      'offline',
      'panel',
      'alert',
    ] as const;

    const { jobs, coinsSpent, newBalance } = await withCoinChargePack(
      req.user!.uid,
      CoinSpendCategory.BRANDING_PACK,
      'Branding-Paket Generierung',
      async () => {
        return Promise.all(
          packModules.map(async (module) => {
            const prompt = buildBrandingModulePrompt(activeDna, module);
            const hd = ['profile-pic', 'banner', 'overlay', 'stream-start', 'stream-end', 'offline'].includes(
              module
            );
            const size = module === 'banner' ? '1792x1024' : moduleImageSizeForPack(module);
            return runGenerationJob(req.user!.uid, module, activeDna, prompt, { size, hd });
          })
        );
      }
    );

    const failed = jobs.filter((j) => j.status === 'failed');
    sendSuccess(
      res,
      {
        jobId: jobs[0]?.id ?? `branding_${Date.now()}`,
        status: failed.length ? 'partial' : 'completed',
        dnaId: activeDna.id,
        jobs,
        failedCount: failed.length,
        coinsSpent,
        newBalance,
      },
      201
    );
  })
);

function moduleImageSizeForPack(module: string): '1024x1024' | '1792x1024' | '1024x1792' {
  if (['banner', 'stream-start', 'stream-end', 'offline', 'panel', 'overlay'].includes(module)) {
    return '1792x1024';
  }
  return '1024x1024';
}
