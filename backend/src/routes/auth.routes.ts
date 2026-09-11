import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate, authenticateAllowUnprovisioned } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getOrCreateUser, getUserById, updateUser, updateOwnProfile, sanitizeDisplayName } from '../services/user.service.js';
import { updateNexterPreferencesForUser } from '../services/nexter/preferences.service.js';
import { getActiveDna } from '../services/dna.service.js';
import { getJobsByUser } from '../services/ai.service.js';
import { listProjects } from '../services/project.service.js';
import { listUserFiles } from '../services/file-cloud.service.js';
import { getRegistrationMode } from '../services/system-settings.service.js';
import { validateInviteCode } from '../services/invite.service.js';
import { syncAuthenticatedAppUser } from '../services/auth-registration.service.js';
import { exportAccountData, requestAccountDeletion } from '../services/account.service.js';
import { randomUUID } from 'node:crypto';
import { isProduction, isDevAuthEnabled } from '../config/env.js';
import { passwordProviderNeedsEmailVerification } from '../lib/email-verification.js';
import { authorizeVerificationResend } from '../services/email-verification-resend.service.js';

export const authRoutes = Router();

authRoutes.get(
  '/registration-status',
  asyncHandler(async (_req, res) => {
    const mode = await getRegistrationMode();
    sendSuccess(res, {
      registrationMode: mode,
      registrationOpen: mode !== 'closed',
      inviteRequired: mode !== 'public' && mode !== 'closed',
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
          'microsoft',
          'email',
        ])
        .optional(),
      acceptedTermsVersion: z.string().min(1).max(64).optional(),
      acceptedPrivacyVersion: z.string().min(1).max(64).optional(),
    });
    const body = schema.parse(req.body);
    const token = req.authToken!;
    const email = token.email;
    const uid = token.uid;

    const { user, created } = await syncAuthenticatedAppUser({
      uid,
      email,
      displayName: body.displayName || token.name,
      inviteCode: body.inviteCode,
      authProvider: body.authProvider,
      legalAcceptance:
        body.acceptedTermsVersion || body.acceptedPrivacyVersion
          ? {
              termsVersion: body.acceptedTermsVersion,
              privacyVersion: body.acceptedPrivacyVersion,
            }
          : undefined,
    });

    sendSuccess(res, { user }, created ? 201 : 200);
  })
);

authRoutes.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await getUserById(req.user!.uid);
    const activeDna = await getActiveDna(req.user!.uid);
    const emailVerified = req.authToken?.emailVerified === true;
    const signInProvider = req.authToken?.signInProvider;
    sendSuccess(res, {
      user,
      activeDna,
      emailVerified,
      signInProvider: signInProvider ?? null,
      needsEmailVerification: passwordProviderNeedsEmailVerification(signInProvider, emailVerified),
    });
  })
);

authRoutes.post(
  '/email-verification/resend',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await authorizeVerificationResend({
      uid: req.user!.uid,
      emailVerified: req.authToken?.emailVerified === true,
      signInProvider: req.authToken?.signInProvider,
    });
    sendSuccess(res, result);
  })
);

authRoutes.patch(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.record(z.string(), z.unknown()).parse(req.body ?? {});
    const user = await updateOwnProfile(req.user!.uid, body);
    sendSuccess(res, { user });
  })
);

authRoutes.patch(
  '/me/nexter-preferences',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.record(z.string(), z.unknown()).parse(req.body ?? {});
    const user = await updateNexterPreferencesForUser(req.user!.uid, body);
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
    const dna = await getActiveDna(req.user!.uid);
    if (!dna) {
      throw new AppError(400, 'NO_DNA', 'Creator DNA muss gespeichert sein, bevor das Onboarding abgeschlossen wird');
    }
    const patch: { onboardingCompleted: true; displayName?: string } = { onboardingCompleted: true };
    if (body.displayName) patch.displayName = sanitizeDisplayName(body.displayName);
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
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    throw new AppError(
      400,
      'BRANDING_REQUIRES_QUOTE',
      'Branding-Paket startet nur über Nexter nach Bestätigung (Streamset / Für X Coins erstellen).'
    );
  })
);
