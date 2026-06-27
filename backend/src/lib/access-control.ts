import { ServiceError } from './errors.js';
import { listAgenciesForUser } from '../services/agency.service.js';
import { listTeamsForUser } from '../services/team.service.js';
import { getChannel } from '../services/chat.service.js';
import {
  listProjectsForPortalUser,
  type ClientProject,
} from '../services/agency-management.service.js';

export async function assertAgencyAccess(userId: string, agencyId: string): Promise<void> {
  const agencies = await listAgenciesForUser(userId);
  if (!agencies.some((a) => a.id === agencyId)) {
    throw new ServiceError(403, 'FORBIDDEN', 'Kein Zugriff auf diese Agentur');
  }
}

export async function assertTeamAccess(userId: string, teamId: string): Promise<void> {
  const teams = await listTeamsForUser(userId);
  if (!teams.some((t) => t.id === teamId)) {
    throw new ServiceError(403, 'FORBIDDEN', 'Kein Zugriff auf dieses Team');
  }
}

export async function assertChannelAccess(userId: string, channelId: string): Promise<void> {
  const channel = await getChannel(channelId);
  if (!channel) {
    throw new ServiceError(404, 'NOT_FOUND', 'Kanal nicht gefunden');
  }
  const memberIds = channel.memberIds ?? [];
  if (channel.ownerId !== userId && !memberIds.includes(userId)) {
    throw new ServiceError(403, 'FORBIDDEN', 'Kein Zugriff auf diesen Kanal');
  }
}

export async function getPortalProjectForUser(userId: string, projectId: string): Promise<ClientProject> {
  const project = (await listProjectsForPortalUser(userId)).find((p) => p.id === projectId);
  if (!project) {
    throw new ServiceError(403, 'FORBIDDEN', 'Kein Zugriff auf dieses Projekt');
  }
  return project;
}
