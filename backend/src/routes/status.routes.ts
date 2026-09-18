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
  areImageGenerationsEnabled,
  areVideoGenerationsEnabled,
  areMusicGenerationsEnabled,
  arePaymentsEnabled,
  isTtsGenerationEnabled,
  isNexterChatEnabled,
  getPaidGenerationAvailability,
  isResendConfigured,
  getTransactionalEmailStatus,
  getFirebaseAuthEmailStatus,
  getCustomEmailProviderStatus,
  getOAuthPublicAvailability,
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
      stripe: { configured: isStripeConfigured(), liveChecked: false, available: null, mode: getStripeMode() },
      paypal: { configured: isPayPalConfigured(), liveChecked: false, available: null, mode: getPayPalMode() },
      resend: { configured: isResendConfigured(), liveChecked: false, available: null },
      firebaseAuthEmail: { status: getFirebaseAuthEmailStatus(), liveChecked: false },
      customEmailProvider: { name: 'resend', status: getCustomEmailProviderStatus(), liveChecked: false },
      transactionalEmail: { status: getTransactionalEmailStatus() },
      rtmp: getRtmpConfig(),
      ai: getAiProviderStatus(),
      registration: {
        mode: registrationMode,
        inviteRequired: registrationMode !== 'public' && registrationMode !== 'closed',
        open: registrationMode !== 'closed',
      },
      killSwitches: {
        generationsEnabled: settings?.generationsEnabled ?? areGenerationsEnabled(),
        imageGenerationsEnabled: areImageGenerationsEnabled(),
        videoGenerationsEnabled: areVideoGenerationsEnabled(),
        musicGenerationsEnabled: areMusicGenerationsEnabled(),
        ttsGenerationEnabled: isTtsGenerationEnabled(),
        nexterChatEnabled: isNexterChatEnabled(),
        paymentsEnabled: arePaymentsEnabled() && (settings?.paymentsEnabled ?? true),
      },
      generationAvailability: getPaidGenerationAvailability(),
      features: {
        devLogin: isProduction() ? false : isDevAuthEnabled(),
        devCoinPurchase: isProduction() ? false : isDevAuthEnabled(),
        liveStreaming: false,
        euroPricing: true,
        inviteCodes: true,
        oauth: getOAuthPublicAvailability(),
      },
    };

    if (!isProduction()) {
      sendSuccess(res, { ...payload, serveStatic: shouldServeStatic() });
      return;
    }

    sendSuccess(res, payload);
  })
);
