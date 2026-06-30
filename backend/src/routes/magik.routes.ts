import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { recordMagikLearningEvent } from '../services/magik-learning.service.js';

export const magikRoutes = Router();
magikRoutes.use(authenticate);

const feedbackSchema = z.object({
  eventType: z.enum(['download', 'delete', 'favorite', 'regenerate']),
  variant: z.enum(['a', 'b']).optional(),
  prompt: z.string().min(10).max(8000),
  profile: z.object({
    magikMode: z.string().optional(),
    magikStyle: z.string().optional(),
    game: z.string().optional(),
    magikCharacter: z.string().optional(),
    magikLogoArt: z.string().optional(),
    magikBackground: z.string().optional(),
  }),
});

magikRoutes.post(
  '/feedback',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = feedbackSchema.parse(req.body);
    await recordMagikLearningEvent(body.eventType, body.profile, body.prompt, body.variant);
    sendSuccess(res, { recorded: true });
  })
);
