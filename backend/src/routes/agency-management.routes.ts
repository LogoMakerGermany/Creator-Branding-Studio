import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getAgencyOverview,
  listClients,
  createClient,
  createAgencyProject,
  updateProjectStatus,
  listAgencyProjects,
} from '../services/agency-management.service.js';
import { listAgenciesForUser, getAgencyMembers } from '../services/agency.service.js';
import { assertAgencyAccess } from '../lib/access-control.js';

export const agencyManagementRoutes = Router();
agencyManagementRoutes.use(authenticate, requirePermission(Permission.MANAGE_AGENCY));

agencyManagementRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const overview = await getAgencyOverview(req.user!.uid);
    const members = overview.agency ? await getAgencyMembers(overview.agency.id) : [];
    sendSuccess(res, { ...overview, members, agencies: await listAgenciesForUser(req.user!.uid) });
  })
);

const clientSchema = z.object({
  agencyId: z.string(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  contactPerson: z.string().optional(),
  portalUserId: z.string().optional(),
});

agencyManagementRoutes.post(
  '/clients',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = clientSchema.parse(req.body);
    await assertAgencyAccess(req.user!.uid, body.agencyId);
    const client = await createClient(body.agencyId, body);
    sendSuccess(res, { client }, 201);
  })
);

agencyManagementRoutes.get(
  '/:agencyId/clients',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const agencyId = String(req.params.agencyId);
    await assertAgencyAccess(req.user!.uid, agencyId);
    sendSuccess(res, { clients: await listClients(agencyId) });
  })
);

const projectSchema = z.object({
  agencyId: z.string(),
  clientId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: z.string().optional(),
  deadline: z.string().optional(),
});

agencyManagementRoutes.post(
  '/projects',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = projectSchema.parse(req.body);
    await assertAgencyAccess(req.user!.uid, body.agencyId);
    const project = await createAgencyProject(body.agencyId, body);
    sendSuccess(res, { project }, 201);
  })
);

agencyManagementRoutes.get(
  '/:agencyId/projects',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const agencyId = String(req.params.agencyId);
    await assertAgencyAccess(req.user!.uid, agencyId);
    sendSuccess(res, { projects: await listAgencyProjects(agencyId) });
  })
);

agencyManagementRoutes.patch(
  '/projects/:id/status',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const agencyId = req.body.agencyId as string;
    const status = req.body.status;
    if (!agencyId || !status) throw new AppError(400, 'INVALID', 'agencyId und status erforderlich');
    await assertAgencyAccess(req.user!.uid, agencyId);
    try {
      const project = await updateProjectStatus(String(req.params.id), agencyId, status);
      sendSuccess(res, { project });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    }
  })
);
