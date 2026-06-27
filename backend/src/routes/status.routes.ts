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
} from '../config/env.js';
import { isPayPalConfigured, getPayPalMode } from '../services/paypal.service.js';
import { shouldServeStatic } from '../middleware/static.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';

export const statusRoutes = Router();

statusRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const environment = isProduction() ? 'production' : 'development';

    if (isProduction()) {
      sendSuccess(res, {
        service: 'ucbs-api',
        version: '0.1.0',
        environment,
        frontendUrl: getPrimaryFrontendUrl(),
        firebase: { admin: isFirebaseAdminConfigured(), mode: 'production' },
        stripe: { configured: isStripeConfigured(), mode: getStripeMode() },
        paypal: { configured: isPayPalConfigured(), mode: getPayPalMode() },
        rtmp: getRtmpConfig(),
        ai: getAiProviderStatus(),
        features: {
          devLogin: false,
          devCoinPurchase: false,
          liveStreaming: false,
        },
      });
      return;
    }

    sendSuccess(res, {
      service: 'ucbs-api',
      version: '0.1.0',
      environment,
      serveStatic: shouldServeStatic(),
      frontendUrl: getPrimaryFrontendUrl(),
      firebase: {
        admin: isFirebaseAdminConfigured(),
        mode: isFirebaseAdminConfigured() ? 'admin' : 'dev-store',
      },
      stripe: { configured: isStripeConfigured(), mode: getStripeMode() },
      paypal: { configured: isPayPalConfigured(), mode: getPayPalMode() },
      rtmp: getRtmpConfig(),
      ai: getAiProviderStatus(),
      features: {
        devLogin: isDevAuthEnabled(),
        devCoinPurchase: isDevAuthEnabled(),
        liveStreaming: false,
      },
    });
  })
);
