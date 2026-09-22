import { Router } from 'express';
import { z } from 'zod';
import type { StyleDirection } from '@ucbs/shared';
import { Permission, STYLE_DIRECTIONS } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listDnaByUser,
  getDnaById,
  getActiveDna,
  upsertDna,
  updateDna,
  activateDna,
  analyzeAssets,
  listDnaVersions,
  restoreDnaVersion,
  applyAnalysisToDna,
  resolveDnaForRequest,
} from '../services/dna.service.js';
import { recordContentRightsAck, assertCurrentContentRightsAck } from '../services/content-rights.service.js';

function asDesignLanguage(value?: {
  mood?: string[];
  keywords?: string[];
  visualElements?: string[];
  doNotUse?: string[];
}) {
  if (!value) return undefined;
  return {
    mood: value.mood ?? [],
    keywords: value.keywords ?? [],
    visualElements: value.visualElements ?? [],
    doNotUse: value.doNotUse ?? [],
  };
}

function asLearned(
  rows?: Array<{ path: string; value: string | string[] | boolean | number; confidence: number; updatedAt?: string }>
) {
  if (!rows) return undefined;
  const now = new Date().toISOString();
  return rows.map((row) => ({
    path: row.path,
    value: row.value,
    confidence: row.confidence,
    updatedAt: row.updatedAt ?? now,
  }));
}

export const dnaRoutes = Router();

dnaRoutes.use(authenticate);

const styleEnum = z.enum(STYLE_DIRECTIONS as [StyleDirection, ...StyleDirection[]]);

const sourceAssetSchema = z.object({
  id: z.string(),
  type: z.enum(['logo', 'profile', 'banner', 'reference']),
  url: z.string().min(1).max(2048),
  fileId: z.string().min(1).max(80).optional(),
  analyzedAt: z.string().optional(),
});

const fontSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(['primary', 'secondary', 'accent']),
  source: z.enum(['google', 'custom', 'system']),
  url: z.string().optional(),
});

const dnaBodySchema = z.object({
  name: z.string().min(1).max(100),
  clanName: z.string().max(100).optional(),
  mascot: z.string().max(100).optional(),
  slogan: z.string().max(160).optional(),
  usagePurpose: z.string().max(200).optional(),
  styleDirection: styleEnum.optional(),
  primaryColors: z.array(z.string().max(32)).max(8).optional(),
  secondaryColors: z.array(z.string().max(32)).max(8).optional(),
  accentColors: z.array(z.string().max(32)).max(8).optional(),
  backgroundColors: z.array(z.string().max(32)).max(8).optional(),
    targetPlatforms: z.array(z.string().max(40)).max(8).optional(),
    favoriteGenres: z.array(z.string().max(60)).max(20).optional(),
  gamingStyle: z.string().max(200).optional(),
  brandingStyle: z.string().max(200).optional(),
  promptStyle: z.string().max(500).optional(),
  visualLanguage: z.string().max(500).optional(),
  animations: z.array(z.string().max(80)).max(20).optional(),
  personalGuidelines: z.string().max(2000).optional(),
  fonts: z.array(fontSchema).max(5).optional(),
  sourceAssets: z.array(sourceAssetSchema).optional(),
  character: z
    .object({
      present: z.boolean(),
      type: z.string().max(40).optional(),
      description: z.string().max(400).optional(),
      clothing: z.string().max(200).optional(),
      hair: z.string().max(120).optional(),
      face: z.string().max(160).optional(),
      accessories: z.string().max(160).optional(),
      traits: z.array(z.string().max(80)).max(12).optional(),
      ccdCharacterId: z.string().optional(),
    })
    .optional(),
  typography: z
    .object({
      character: z.string().max(80).optional(),
      weight: z.string().max(40).optional(),
      direction: z.string().max(40).optional(),
      nameTreatment: z.string().max(80).optional(),
    })
    .optional(),
  atmosphere: z
    .object({
      lighting: z.string().max(80).optional(),
      mood: z.string().max(80).optional(),
      effects: z.array(z.string().max(60)).max(12).optional(),
      particles: z.boolean().optional(),
      glow: z.boolean().optional(),
      smoke: z.boolean().optional(),
    })
    .optional(),
  outputPrefs: z
    .object({
      platform: z.string().max(40).optional(),
      aspectRatios: z.array(z.string().max(20)).max(8).optional(),
      outputKinds: z.array(z.string().max(40)).max(8).optional(),
    })
    .optional(),
  locks: z
    .object({
      name: z.boolean().optional(),
      colors: z.boolean().optional(),
      mascot: z.boolean().optional(),
      character: z.boolean().optional(),
      style: z.boolean().optional(),
      fonts: z.boolean().optional(),
      typography: z.boolean().optional(),
    })
    .optional(),
  lightingStyle: z.string().max(80).optional(),
  dimension: z.enum(['2d', '3d']).optional(),
  designLanguage: z
    .object({
      mood: z.array(z.string().max(80)).max(12).optional(),
      keywords: z.array(z.string().max(80)).max(20).optional(),
      visualElements: z.array(z.string().max(80)).max(12).optional(),
      doNotUse: z.array(z.string().max(80)).max(20).optional(),
    })
    .optional(),
  identity: z
    .object({
      alias: z.string().max(80).optional(),
      bio: z.string().max(400).optional(),
      creatorCategory: z.string().max(80).optional(),
      languages: z.array(z.string().max(24)).max(8).optional(),
    })
    .optional(),
  contentCategories: z.array(z.string().max(80)).max(12).optional(),
  dislikedColors: z.array(z.string().max(32)).max(8).optional(),
  visualStyles: z.array(z.string().max(80)).max(12).optional(),
  preferredShapes: z.array(z.string().max(80)).max(12).optional(),
  stream: z
    .object({
      preferredLayout: z.string().max(200).optional(),
      facecamPreference: z.string().max(200).optional(),
      chatPreference: z.string().max(200).optional(),
      alertStyle: z.string().max(200).optional(),
      overlayStyle: z.string().max(200).optional(),
      startingScreenStyle: z.string().max(200).optional(),
      endingScreenStyle: z.string().max(200).optional(),
    })
    .optional(),
  video: z
    .object({
      preferredAspectRatios: z.array(z.string().max(20)).max(8).optional(),
      editingStyle: z.array(z.string().max(80)).max(12).optional(),
      subtitlePreference: z.string().max(200).optional(),
      transitionStyle: z.string().max(200).optional(),
      pacingPreference: z.string().max(200).optional(),
    })
    .optional(),
  audio: z
    .object({
      musicStyle: z.array(z.string().max(80)).max(12).optional(),
      voicePreference: z.string().max(200).optional(),
      soundEffectStyle: z.array(z.string().max(80)).max(12).optional(),
    })
    .optional(),
  assistant: z
    .object({
      assistantTone: z.string().max(80).optional(),
      assistantVerbosity: z.string().max(80).optional(),
      proactiveSuggestions: z.boolean().optional(),
      askBeforeMajorChanges: z.boolean().optional(),
      preferredWorkflow: z.string().max(200).optional(),
    })
    .optional(),
  brand: z
    .object({
      logoAssetId: z.string().max(80).optional(),
      mascotAssetId: z.string().max(80).optional(),
      recurringSymbols: z.array(z.string().max(80)).max(12).optional(),
      slogans: z.array(z.string().max(160)).max(8).optional(),
    })
    .optional(),
  preferenceSources: z
    .record(
      z.string().max(80),
      z.object({
        source: z.enum(['explicit', 'learned', 'system']),
        confidence: z.number().min(0).max(1).optional(),
        updatedAt: z.string().max(40).optional(),
      })
    )
    .optional(),
  learned: z
    .array(
      z.object({
        path: z.string().max(80),
        value: z.union([z.string().max(200), z.array(z.string().max(80)).max(8), z.boolean(), z.number()]),
        confidence: z.number().min(0).max(1),
        updatedAt: z.string().max(40).optional(),
      })
    )
    .max(40)
    .optional(),
});

dnaRoutes.get(
  '/',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dnas = await listDnaByUser(req.user!.uid);
    const active = dnas.find((d) => d.isActive) ?? dnas[0] ?? null;
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
  '/resolve',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const resolved = await resolveDnaForRequest(req.user!.uid, projectId);
    sendSuccess(res, resolved);
  })
);

dnaRoutes.get(
  '/:id/versions',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const versions = await listDnaVersions(String(req.params.id), req.user!.uid);
    sendSuccess(res, { versions });
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

dnaRoutes.post(
  '/',
  requirePermission(Permission.CREATE_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = dnaBodySchema.parse(req.body);

    let aiAnalysis;
    const allColors = [
      ...(body.primaryColors ?? []),
      ...(body.secondaryColors ?? []),
      ...(body.accentColors ?? []),
    ];
    if (allColors.length > 0) {
      const imageUrl = body.sourceAssets?.find((a) => a.url.startsWith('data:image/'))?.url;
      try {
        aiAnalysis = await analyzeAssets(
          allColors,
          body.styleDirection as StyleDirection | undefined,
          imageUrl
        );
      } catch {
        aiAnalysis = undefined;
      }
    }

    const dna = await upsertDna({
      userId: req.user!.uid,
      name: body.name,
      clanName: body.clanName,
      mascot: body.mascot,
      styleDirection: body.styleDirection as StyleDirection | undefined,
      primaryColors: body.primaryColors,
      secondaryColors: body.secondaryColors,
      accentColors: body.accentColors,
      targetPlatforms: body.targetPlatforms,
      favoriteGenres: body.favoriteGenres,
      gamingStyle: body.gamingStyle,
      brandingStyle: body.brandingStyle,
      promptStyle: body.promptStyle,
      visualLanguage: body.visualLanguage,
      animations: body.animations,
      personalGuidelines: body.personalGuidelines,
      fonts: body.fonts,
      sourceAssets: body.sourceAssets,
      slogan: body.slogan,
      usagePurpose: body.usagePurpose,
      backgroundColors: body.backgroundColors,
      character: body.character,
      typography: body.typography,
      atmosphere: body.atmosphere,
      outputPrefs: body.outputPrefs,
      locks: body.locks,
      lightingStyle: body.lightingStyle,
      dimension: body.dimension,
      designLanguage: asDesignLanguage(body.designLanguage),
      identity: body.identity,
      contentCategories: body.contentCategories,
      dislikedColors: body.dislikedColors,
      visualStyles: body.visualStyles,
      preferredShapes: body.preferredShapes,
      stream: body.stream,
      video: body.video,
      audio: body.audio,
      assistant: body.assistant,
      brand: body.brand,
      preferenceSources: body.preferenceSources,
      learned: asLearned(body.learned),
      aiAnalysis,
    });

    const existing = await listDnaByUser(req.user!.uid);
    const created = existing.length <= 1 && dna.version === 1;
    sendSuccess(res, { dna }, created ? 201 : 200);
  })
);

dnaRoutes.patch(
  '/:id',
  requirePermission(Permission.EDIT_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = dnaBodySchema.partial().parse(req.body);
    if (Object.keys(body).length === 0) {
      throw new AppError(400, 'INVALID_INPUT', 'Keine Änderungen übermittelt');
    }

    const existing = await getDnaById(String(req.params.id), req.user!.uid);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'DNA nicht gefunden');

    const dna = await updateDna(String(req.params.id), req.user!.uid, {
      userId: req.user!.uid,
      name: body.name ?? existing.name,
      clanName: body.clanName,
      mascot: body.mascot,
      styleDirection: body.styleDirection as StyleDirection | undefined,
      primaryColors: body.primaryColors,
      secondaryColors: body.secondaryColors,
      accentColors: body.accentColors,
      targetPlatforms: body.targetPlatforms,
      favoriteGenres: body.favoriteGenres,
      gamingStyle: body.gamingStyle,
      brandingStyle: body.brandingStyle,
      promptStyle: body.promptStyle,
      visualLanguage: body.visualLanguage,
      animations: body.animations,
      personalGuidelines: body.personalGuidelines,
      fonts: body.fonts,
      sourceAssets: body.sourceAssets,
      slogan: body.slogan,
      usagePurpose: body.usagePurpose,
      backgroundColors: body.backgroundColors,
      character: body.character,
      typography: body.typography,
      atmosphere: body.atmosphere,
      outputPrefs: body.outputPrefs,
      locks: body.locks,
      lightingStyle: body.lightingStyle,
      dimension: body.dimension,
      designLanguage: asDesignLanguage(body.designLanguage),
      identity: body.identity,
      contentCategories: body.contentCategories,
      dislikedColors: body.dislikedColors,
      visualStyles: body.visualStyles,
      preferredShapes: body.preferredShapes,
      stream: body.stream,
      video: body.video,
      audio: body.audio,
      assistant: body.assistant,
      brand: body.brand,
      preferenceSources: body.preferenceSources,
      learned: asLearned(body.learned),
    });
    sendSuccess(res, { dna });
  })
);

const analyzeSchema = z.object({
  colors: z.array(z.string()).optional(),
  styleHint: z.string().optional(),
  imageDataUrl: z.string().optional(),
  rightsConfirmed: z.literal(true).optional(),
});

dnaRoutes.post(
  '/analyze',
  requirePermission(Permission.CREATE_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = analyzeSchema.parse(req.body);
    if (!body.imageDataUrl && (!body.colors || body.colors.length === 0)) {
      throw new AppError(400, 'INVALID_INPUT', 'Farben oder imageDataUrl erforderlich');
    }
    if (body.imageDataUrl) {
      if (body.rightsConfirmed === true) await recordContentRightsAck(req.user!.uid);
      else await assertCurrentContentRightsAck(req.user!.uid);
    }
    const analysis = await analyzeAssets(
      body.colors ?? [],
      body.styleHint as StyleDirection | undefined,
      body.imageDataUrl
    );
    sendSuccess(res, { analysis });
  })
);

dnaRoutes.post(
  '/:id/versions/:versionId/restore',
  requirePermission(Permission.EDIT_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const dna = await restoreDnaVersion(
        String(req.params.id),
        String(req.params.versionId),
        req.user!.uid
      );
      sendSuccess(res, { dna });
    } catch (err) {
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Version nicht gefunden');
    }
  })
);

dnaRoutes.post(
  '/:id/apply-analysis',
  requirePermission(Permission.EDIT_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const existing = await getDnaById(String(req.params.id), req.user!.uid);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'DNA nicht gefunden');
    const body = analyzeSchema.parse(req.body);
    if (!body.imageDataUrl && (!body.colors || body.colors.length === 0)) {
      throw new AppError(400, 'INVALID_INPUT', 'Farben oder imageDataUrl erforderlich');
    }
    if (body.imageDataUrl) {
      if (body.rightsConfirmed === true) await recordContentRightsAck(req.user!.uid);
      else await assertCurrentContentRightsAck(req.user!.uid);
    }
    const analysis = await analyzeAssets(
      body.colors ?? [],
      body.styleHint as StyleDirection | undefined,
      body.imageDataUrl
    );
    try {
      const dna = await applyAnalysisToDna(existing.id, req.user!.uid, analysis);
      sendSuccess(res, { dna, analysis });
    } catch (err) {
      throw new AppError(400, 'APPLY_FAILED', err instanceof Error ? err.message : 'Analyse konnte nicht übernommen werden');
    }
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
