import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getUpcomingEvents,
} from '../services/calendar.service.js';
import {
  getUpcomingPlanningItems,
  listPlanningItems,
  listTodayPlanningItems,
} from '../services/planning.service.js';
import { getProject } from '../services/project.service.js';
import { getSocialPost } from '../services/social.service.js';

export const calendarRoutes = Router();
calendarRoutes.use(authenticate, requirePermission(Permission.MANAGE_CALENDAR));

function mapCalendarError(err: unknown): never {
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message);
  }
  throw new AppError(400, 'CALENDAR_ERROR', err instanceof Error ? err.message : 'Kalender-Fehler');
}

const listQuery = z.object({
  platform: z.string().max(40).optional(),
  contentType: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
  q: z.string().max(200).optional(),
  from: z.string().max(80).optional(),
  to: z.string().max(80).optional(),
});

calendarRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const query = listQuery.parse(req.query);
    const userId = req.user!.uid;
    sendSuccess(res, {
      events: await listCalendarEvents(userId),
      upcoming: await getUpcomingEvents(userId),
      items: await listPlanningItems(userId, query),
      today: await listTodayPlanningItems(userId),
      upcomingItems: await getUpcomingPlanningItems(userId, 5),
      publishingAvailable: false,
    });
  })
);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['post', 'video', 'stream', 'campaign', 'deadline']),
  platform: z.string().optional(),
  startAt: z.string(),
  endAt: z.string().optional(),
  color: z.string().optional(),
  socialPostId: z.string().max(80).optional(),
  packageId: z.string().max(80).optional(),
  projectId: z.string().max(80).optional(),
  contentType: z.string().max(40).optional(),
});

calendarRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    try {
      if (body.projectId) {
        const project = await getProject(body.projectId, req.user!.uid);
        if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
      }
      if (body.socialPostId) {
        const post = await getSocialPost(body.socialPostId, req.user!.uid);
        if (!post) throw new ServiceError(404, 'NOT_FOUND', 'Post nicht gefunden');
      }
      const event = await createCalendarEvent(req.user!.uid, body);
      sendSuccess(res, { event }, 201);
    } catch (err) {
      mapCalendarError(err);
    }
  })
);

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  type: z.enum(['post', 'video', 'stream', 'campaign', 'deadline']).optional(),
  platform: z.string().optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  status: z.enum(['planned', 'in_progress', 'done', 'cancelled']).optional(),
  color: z.string().optional(),
});

calendarRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const body = updateSchema.parse(req.body);
      const event = await updateCalendarEvent(String(req.params.id), req.user!.uid, body);
      sendSuccess(res, { event });
    } catch (err) {
      mapCalendarError(err);
    }
  })
);

calendarRoutes.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      await deleteCalendarEvent(String(req.params.id), req.user!.uid);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      mapCalendarError(err);
    }
  })
);
