import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getWhiteLabelConfig,
  updateWhiteLabelConfig,
  previewWhiteLabel,
} from '../services/white-label.service.js';

export const whiteLabelRoutes = Router();
whiteLabelRoutes.use(authenticate, requirePermission(Permission.MANAGE_WHITE_LABEL));

whiteLabelRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const config = await getWhiteLabelConfig(req.user!.uid);
    sendSuccess(res, { config, preview: previewWhiteLabel(config) });
  })
);

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  customDomain: z.string().max(200).optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  faviconUrl: z.string().optional(),
  platformName: z.string().max(100).optional(),
});

whiteLabelRoutes.patch(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = updateSchema.parse(req.body);
    const config = await updateWhiteLabelConfig(req.user!.uid, body);
    sendSuccess(res, { config, preview: previewWhiteLabel(config) });
  })
);
