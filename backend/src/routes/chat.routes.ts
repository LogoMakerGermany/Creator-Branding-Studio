import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getOrCreateDefaultChannel,
  listMessages,
  sendMessage,
} from '../services/chat.service.js';
import { assertChannelAccess } from '../lib/access-control.js';

export const chatRoutes = Router();
chatRoutes.use(authenticate, requirePermission(Permission.USE_TEAM_CHAT));

chatRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const channel = await getOrCreateDefaultChannel(req.user!.uid, req.user!.displayName ?? 'User');
    const messages = await listMessages(channel.id);
    sendSuccess(res, { channel, messages });
  })
);

const messageSchema = z.object({
  content: z.string().min(1).max(2000),
  channelId: z.string().optional(),
});

chatRoutes.post(
  '/messages',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = messageSchema.parse(req.body);
    let channelId: string;
    if (body.channelId) {
      await assertChannelAccess(req.user!.uid, body.channelId);
      channelId = body.channelId;
    } else {
      channelId = (await getOrCreateDefaultChannel(req.user!.uid, req.user!.displayName ?? 'User')).id;
    }

    const message = await sendMessage(
      channelId,
      req.user!.uid,
      req.user!.displayName ?? 'User',
      body.content
    );
    sendSuccess(res, { message }, 201);
  })
);

chatRoutes.get(
  '/:channelId/messages',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const channelId = String(req.params.channelId);
    await assertChannelAccess(req.user!.uid, channelId);
    const messages = await listMessages(channelId);
    sendSuccess(res, { messages });
  })
);
