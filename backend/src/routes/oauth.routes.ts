import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { completeOAuthTicket, handleOAuthCallback, startOAuth, getOAuthCompleteUrl } from '../services/oauth.service.js';
import { getOAuthPublicAvailability } from '../config/env.js';

export const oauthRoutes = Router();

const providerParam = z.object({
  provider: z.enum(['discord', 'twitch', 'tiktok']),
});

oauthRoutes.get(
  '/availability',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { oauth: getOAuthPublicAvailability() });
  })
);

oauthRoutes.get(
  '/:provider/start',
  asyncHandler(async (req, res) => {
    const { provider } = providerParam.parse(req.params);
    const query = z
      .object({
        intent: z.enum(['login', 'register', 'link']).optional(),
        inviteCode: z.string().max(64).optional(),
        termsVersion: z.string().max(64).optional(),
        privacyVersion: z.string().max(64).optional(),
      })
      .parse(req.query);
    try {
      const { url } = await startOAuth({
        provider,
        intent: query.intent,
        inviteCode: query.inviteCode,
        termsVersion: query.termsVersion,
        privacyVersion: query.privacyVersion,
      });
      res.redirect(302, url);
    } catch (err) {
      if (err instanceof AppError && err.code === 'OAUTH_NOT_CONFIGURED') {
        res.redirect(302, getOAuthCompleteUrl('', 'not_configured'));
        return;
      }
      throw err;
    }
  })
);

oauthRoutes.post(
  '/:provider/link/start',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { provider } = providerParam.parse(req.params);
    const { url } = await startOAuth({
      provider,
      intent: 'link',
      linkUid: req.user!.uid,
    });
    sendSuccess(res, { url });
  })
);

oauthRoutes.get(
  '/:provider/callback',
  asyncHandler(async (req, res) => {
    const { provider } = providerParam.parse(req.params);
    const query = z
      .object({
        code: z.string().max(2048).optional(),
        state: z.string().max(256).optional(),
        error: z.string().max(128).optional(),
      })
      .parse(req.query);
    const { redirectTo } = await handleOAuthCallback({
      provider,
      code: query.code,
      state: query.state,
      error: query.error,
    });
    res.redirect(302, redirectTo);
  })
);

oauthRoutes.post(
  '/complete', // POST /api/v1/auth/oauth/complete
  asyncHandler(async (req, res) => {
    const body = z.object({ ticket: z.string().min(8).max(256) }).parse(req.body);
    const result = await completeOAuthTicket(body.ticket);
    sendSuccess(res, {
      customToken: result.customToken,
      provider: result.provider,
      inviteCode: result.inviteCode,
      legalAcceptance:
        result.termsVersion && result.privacyVersion
          ? { termsVersion: result.termsVersion, privacyVersion: result.privacyVersion }
          : undefined,
    });
  })
);
