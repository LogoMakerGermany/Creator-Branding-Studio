import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listAgenciesForUser,
  getAgency,
  createAgency,
  createAgencyDna,
  getAgencyMembers,
} from '../services/agency.service.js';
import { getDnaById } from '../services/dna.service.js';
import { assertAgencyAccess } from '../lib/access-control.js';

export const agencyRoutes = Router();
agencyRoutes.use(authenticate, requirePermission(Permission.MANAGE_AGENCY));

agencyRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { agencies: await listAgenciesForUser(req.user!.uid) });
  })
);

agencyRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    await assertAgencyAccess(req.user!.uid, id);
    const agency = await getAgency(id);
    if (!agency) throw new AppError(404, 'NOT_FOUND', 'Agentur nicht gefunden');
    const members = await getAgencyMembers(id);
    let dna = null;
    if (agency.dnaId) {
      dna = await getDnaById(agency.dnaId, req.user!.uid);
    }
    sendSuccess(res, { agency, members, dna });
  })
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

agencyRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const agency = await createAgency(req.user!.uid, body);
    sendSuccess(res, { agency }, 201);
  })
);

agencyRoutes.post(
  '/:id/dna',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    await assertAgencyAccess(req.user!.uid, id);
    const baseDnaId = req.body.baseDnaId as string | undefined;
    try {
      const result = await createAgencyDna(id, req.user!.uid, baseDnaId);
      sendSuccess(res, result, 201);
    } catch (err) {
      throw new AppError(400, 'DNA_FAILED', err instanceof Error ? err.message : 'Fehler');
    }
  })
);
