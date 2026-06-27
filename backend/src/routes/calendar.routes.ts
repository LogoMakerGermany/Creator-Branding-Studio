import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getUpcomingEvents,
} from '../services/calendar.service.js';

export const calendarRoutes = Router();
calendarRoutes.use(authenticate, requirePermission(Permission.MANAGE_CALENDAR));

calendarRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      events: await listCalendarEvents(req.user!.uid),
      upcoming: await getUpcomingEvents(req.user!.uid),
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
});

calendarRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const event = await createCalendarEvent(req.user!.uid, body);
    sendSuccess(res, { event }, 201);
  })
);

calendarRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const event = await updateCalendarEvent(String(req.params.id), req.user!.uid, req.body);
      sendSuccess(res, { event });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Termin nicht gefunden');
    }
  })
);

calendarRoutes.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      await deleteCalendarEvent(String(req.params.id), req.user!.uid);
      sendSuccess(res, { deleted: true });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Termin nicht gefunden');
    }
  })
);
