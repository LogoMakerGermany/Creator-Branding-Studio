import { Router } from 'express';
import {
  isProduction,
  isFirebaseAdminConfigured,
  isStripeConfigured,
  getStripeMode,
  isDevAuthEnabled,
  getPrimaryFrontendUrl,
  getRtmpConfig,
  getAiProviderStatus,
  isPayPalConfigured,
  getPayPalMode,
  getRegistrationModeEnv,
  areGenerationsEnabled,
  arePaymentsEnabled,
} from '../config/env.js';
import { shouldServeStatic } from '../middleware/static.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import { getRegistrationMode, getSystemSettings } from '../services/system-settings.service.js';

export const statusRoutes = Router();

statusRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const environment = isProduction() ? 'production' : 'development';
    const registrationMode = await getRegistrationMode().catch(() => getRegistrationModeEnv());
    const settings = await getSystemSettings().catch(() => null);

    const payload = {
      service: 'ucbs-api',
      version: '0.1.0',
      environment,
      frontendUrl: getPrimaryFrontendUrl(),
      firebase: {
        admin: isFirebaseAdminConfigured(),
        mode: isProduction()
          ? 'production'
          : isFirebaseAdminConfigured()
            ? 'admin'
            : 'dev-store',
      },
      stripe: { configured: isStripeConfigured(), mode: getStripeMode() },
      paypal: { configured: isPayPalConfigured(), mode: getPayPalMode() },
      rtmp: getRtmpConfig(),
      ai: getAiProviderStatus(),
      registration: {
        mode: registrationMode,
        inviteRequired: registrationMode === 'invite_only',
        open: registrationMode !== 'closed',
      },
      killSwitches: {
        generationsEnabled: settings?.generationsEnabled ?? areGenerationsEnabled(),
        paymentsEnabled: settings?.paymentsEnabled ?? arePaymentsEnabled(),
      },
      features: {
        devLogin: isProduction() ? false : isDevAuthEnabled(),
        devCoinPurchase: isProduction() ? false : isDevAuthEnabled(),
        liveStreaming: false,
        euroPricing: true,
        inviteCodes: true,
      },
    };

    if (!isProduction()) {
      sendSuccess(res, { ...payload, serveStatic: shouldServeStatic() });
      return;
    }

    sendSuccess(res, payload);
  })
);
