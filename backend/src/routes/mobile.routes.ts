import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getMobileConfig,
  updateMobileConfig,
  listDevices,
  registerDevice,
  getPwaManifest,
  getStoreLinks,
} from '../services/mobile.service.js';

export const mobileRoutes = Router();
mobileRoutes.use(authenticate, requirePermission(Permission.USE_MOBILE_APP));

mobileRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const config = await getMobileConfig(req.user!.uid);
    sendSuccess(res, {
      config,
      devices: await listDevices(req.user!.uid),
      manifest: getPwaManifest(req.user!.uid, config),
      stores: getStoreLinks(),
    });
  })
);

const updateSchema = z.object({
  pwaEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  androidEnabled: z.boolean().optional(),
  iosEnabled: z.boolean().optional(),
  appName: z.string().max(100).optional(),
  shortName: z.string().max(12).optional(),
  themeColor: z.string().optional(),
  splashColor: z.string().optional(),
});

mobileRoutes.patch(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = updateSchema.parse(req.body);
    const config = await updateMobileConfig(req.user!.uid, body);
    sendSuccess(res, { config, manifest: getPwaManifest(req.user!.uid, config) });
  })
);

const deviceSchema = z.object({
  platform: z.enum(['android', 'ios', 'pwa']),
  deviceName: z.string().min(1).max(100),
  pushToken: z.string().optional(),
});

mobileRoutes.post(
  '/devices',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = deviceSchema.parse(req.body);
    const device = await registerDevice(req.user!.uid, body);
    sendSuccess(res, { device }, 201);
  })
);
