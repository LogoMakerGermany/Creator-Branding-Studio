import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listTeamsForUser,
  getTeam,
  createTeam,
  createTeamDna,
  getTeamMembers,
} from '../services/team.service.js';
import { getDnaById } from '../services/dna.service.js';
import { assertTeamAccess } from '../lib/access-control.js';

export const teamRoutes = Router();
teamRoutes.use(authenticate, requirePermission(Permission.MANAGE_TEAM));

teamRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { teams: await listTeamsForUser(req.user!.uid) });
  })
);

teamRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    await assertTeamAccess(req.user!.uid, id);
    const team = await getTeam(id);
    if (!team) throw new AppError(404, 'NOT_FOUND', 'Team nicht gefunden');
    const members = await getTeamMembers(id);
    let dna = null;
    if (team.dnaId) {
      dna = await getDnaById(team.dnaId, req.user!.uid);
    }
    sendSuccess(res, { team, members, dna });
  })
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['clan', 'esports', 'streaming', 'music', 'content']),
  description: z.string().max(500).optional(),
  maxMembers: z.number().min(2).max(100).optional(),
});

teamRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const team = await createTeam(req.user!.uid, body);
    sendSuccess(res, { team }, 201);
  })
);

teamRoutes.post(
  '/:id/dna',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    await assertTeamAccess(req.user!.uid, id);
    const baseDnaId = req.body.baseDnaId as string | undefined;
    try {
      const result = await createTeamDna(id, req.user!.uid, baseDnaId);
      sendSuccess(res, result, 201);
    } catch (err) {
      throw new AppError(400, 'DNA_FAILED', err instanceof Error ? err.message : 'Fehler');
    }
  })
);
