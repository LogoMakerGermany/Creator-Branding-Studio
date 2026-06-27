import { Router } from 'express';
import { z } from 'zod';
import type { StyleDirection } from '@ucbs/shared';
import { Permission, CoinSpendCategory } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listDnaByUser,
  getDnaById,
  getActiveDna,
  createDna,
  activateDna,
  analyzeAssets,
} from '../services/dna.service.js';
import { deductCoins } from '../services/coins.service.js';

export const dnaRoutes = Router();

dnaRoutes.use(authenticate);

dnaRoutes.get(
  '/',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dnas = await listDnaByUser(req.user!.uid);
    const active = dnas.find((d) => d.isActive) ?? null;
    sendSuccess(res, { dnas, active });
  })
);

dnaRoutes.get(
  '/active',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const active = await getActiveDna(req.user!.uid);
    sendSuccess(res, { dna: active });
  })
);

dnaRoutes.get(
  '/:id',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dna = await getDnaById(String(req.params.id), req.user!.uid);
    if (!dna) throw new AppError(404, 'NOT_FOUND', 'DNA nicht gefunden');
    sendSuccess(res, { dna });
  })
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  styleDirection: z
    .enum([
      'gaming', 'streaming', 'music', 'anime', 'fantasy', 'esports',
      'horror', 'neon', 'realistic', 'minimal', 'corporate', 'custom',
    ])
    .optional(),
  primaryColors: z.array(z.string()).optional(),
  secondaryColors: z.array(z.string()).optional(),
  accentColors: z.array(z.string()).optional(),
  targetPlatforms: z.array(z.string()).optional(),
  sourceAssets: z.array(z.object({
    id: z.string(),
    type: z.enum(['logo', 'profile', 'banner', 'reference']),
    url: z.string(),
  })).optional(),
});

dnaRoutes.post(
  '/',
  requirePermission(Permission.CREATE_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);

    let aiAnalysis;
    const allColors = [
      ...(body.primaryColors ?? []),
      ...(body.secondaryColors ?? []),
      ...(body.accentColors ?? []),
    ];
    if (allColors.length > 0) {
      aiAnalysis = await analyzeAssets(allColors, body.styleDirection as StyleDirection);
    }

    const dna = await createDna({
      userId: req.user!.uid,
      name: body.name,
      styleDirection: body.styleDirection as StyleDirection,
      primaryColors: body.primaryColors,
      secondaryColors: body.secondaryColors,
      accentColors: body.accentColors,
      targetPlatforms: body.targetPlatforms,
      sourceAssets: body.sourceAssets,
      aiAnalysis,
    });

    sendSuccess(res, { dna }, 201);
  })
);

const analyzeSchema = z.object({
  colors: z.array(z.string()).min(1),
  styleHint: z.string().optional(),
});

dnaRoutes.post(
  '/analyze',
  requirePermission(Permission.CREATE_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = analyzeSchema.parse(req.body);
    const analysis = await analyzeAssets(
      body.colors,
      body.styleHint as StyleDirection | undefined
    );
    sendSuccess(res, { analysis });
  })
);

dnaRoutes.post(
  '/:id/activate',
  requirePermission(Permission.EDIT_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dna = await activateDna(String(req.params.id), req.user!.uid);
    sendSuccess(res, { dna });
  })
);
