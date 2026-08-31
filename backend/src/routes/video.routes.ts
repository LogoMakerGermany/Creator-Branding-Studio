import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveDna } from '../services/dna.service.js';
import {
  listVideoProjects,
  getVideoProject,
  createVideoProject,
  detectHighlights,
  generateSubtitles,
  renderVideoProject,
  listMediaJobs,
  attachVideoSource,
  saveEditPlan,
  analyzeVideoLocally,
  saveSubtitleEdits,
  exportShortClip,
  saveVideoRenderToProject,
  saveVideoOutputToFiles,
} from '../services/media.service.js';

export const videoRoutes = Router();
videoRoutes.use(authenticate, requirePermission(Permission.USE_VIDEO_STUDIO));

videoRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      projects: await listVideoProjects(req.user!.uid),
      jobs: await listMediaJobs(req.user!.uid, 'video-edit'),
    });
  })
);

videoRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await getVideoProject(String(req.params.id), req.user!.uid);
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    sendSuccess(res, { project });
  })
);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  duration: z.number().min(1).max(7200).default(300),
  format: z
    .enum(['youtube', 'tiktok', 'shorts', 'trailer', 'ad', 'instagram', 'custom'])
    .default('shorts'),
});

videoRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const activeDna = await getActiveDna(req.user!.uid);
    const project = await createVideoProject(
      req.user!.uid,
      body.title,
      body.duration,
      body.format,
      activeDna?.id
    );
    sendSuccess(res, { project }, 201);
  })
);

videoRoutes.post(
  '/:id/highlights',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const activeDna = await getActiveDna(req.user!.uid);
    const project = await detectHighlights(
      String(req.params.id),
      req.user!.uid,
      activeDna?.styleDirection
    );
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/subtitles',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await generateSubtitles(String(req.params.id), req.user!.uid);
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/render',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await renderVideoProject(String(req.params.id), req.user!.uid);
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/shorts',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        highlightIndex: z.number().int().min(0).optional(),
        start: z.number().min(0).optional(),
        end: z.number().min(0).optional(),
        format: z
          .enum(['youtube', 'tiktok', 'shorts', 'trailer', 'ad', 'instagram', 'custom'])
          .optional(),
        crop: z
          .object({
            mode: z.enum(['center', 'manual']),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .optional(),
        burnSubtitles: z.boolean().optional(),
      })
      .parse(req.body);

    const project = await getVideoProject(String(req.params.id), req.user!.uid);
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');

    let start = body.start;
    let end = body.end;
    if ((start == null || end == null) && body.highlightIndex != null) {
      const h = project.highlights[body.highlightIndex];
      if (!h) throw new AppError(404, 'NOT_FOUND', 'Highlight nicht gefunden');
      start = h.start;
      end = h.end;
    }
    if (start == null || end == null) {
      start = project.editPlan?.trimStart ?? 0;
      end = project.editPlan?.trimEnd ?? Math.min(project.duration, 15);
    }

    const job = await exportShortClip(String(req.params.id), req.user!.uid, {
      start,
      end,
      crop: body.crop,
      format: body.format,
      burnSubtitles: body.burnSubtitles,
    });
    sendSuccess(res, { job, coinsSpent: 0, newBalance: undefined }, 201);
  })
);

const cropSchema = z.object({
  mode: z.enum(['center', 'manual']),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

videoRoutes.patch(
  '/:id/edit-plan',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        trimStart: z.number().min(0),
        trimEnd: z.number().min(0),
        removeSegments: z.array(z.object({ start: z.number(), end: z.number() })).optional(),
        volume: z.number().min(0).max(2).optional(),
        crop: cropSchema.optional(),
        aspectRatio: z.enum(['16:9', '9:16', 'original']).optional(),
        subtitleTrack: z.boolean().optional(),
      })
      .parse(req.body);
    const project = await saveEditPlan(String(req.params.id), req.user!.uid, {
      trimStart: body.trimStart,
      trimEnd: body.trimEnd,
      removeSegments: body.removeSegments ?? [],
      volume: body.volume ?? 1,
      crop: body.crop ?? { mode: 'center', x: 0, y: 0, width: 1, height: 1 },
      aspectRatio: body.aspectRatio ?? 'original',
      subtitleTrack: body.subtitleTrack ?? false,
    });
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/analyze-local',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await analyzeVideoLocally(String(req.params.id), req.user!.uid);
    sendSuccess(res, { project });
  })
);

videoRoutes.patch(
  '/:id/subtitles',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        subtitles: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })),
      })
      .parse(req.body);
    const project = await saveSubtitleEdits(String(req.params.id), req.user!.uid, body.subtitles);
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/save-project',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ projectId: z.string().min(1) }).parse(req.body);
    const result = await saveVideoRenderToProject(req.user!.uid, String(req.params.id), body.projectId);
    sendSuccess(res, result, 201);
  })
);

videoRoutes.post(
  '/:id/save-file',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const file = await saveVideoOutputToFiles(req.user!.uid, String(req.params.id));
    sendSuccess(res, { file }, 201);
  })
);

videoRoutes.post(
  '/:id/shorts/:jobId/save-file',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const file = await saveVideoOutputToFiles(
      req.user!.uid,
      String(req.params.id),
      String(req.params.jobId)
    );
    sendSuccess(res, { file }, 201);
  })
);

const sourceSchema = z.object({
  dataUrl: z.string().min(20),
  duration: z.number().min(1).max(7200).optional(),
  rightsConfirmed: z.literal(true),
});

videoRoutes.post(
  '/:id/source',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = sourceSchema.parse(req.body);
    const project = await attachVideoSource(
      String(req.params.id),
      req.user!.uid,
      body.dataUrl,
      body.duration
    );
    sendSuccess(res, { project });
  })
);
