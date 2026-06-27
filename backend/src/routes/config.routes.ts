import { Router } from 'express';
import { getPublicClientConfig } from '../services/client-config.service.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';

export const configRoutes = Router();

configRoutes.get(
  '/client',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, getPublicClientConfig());
  })
);
