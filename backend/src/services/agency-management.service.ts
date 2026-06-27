import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
import { listAgenciesForUser, getAgency } from './agency.service.js';

const CLIENTS_COLLECTION = 'agencyClients';
const PROJECTS_COLLECTION = 'clientProjects';

export interface AgencyClient {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  contactPerson?: string;
  portalUserId?: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

export interface ClientProject {
  id: string;
  agencyId: string;
  clientId: string;
  title: string;
  description?: string;
  type: string;
  status: 'draft' | 'in_progress' | 'review' | 'revision' | 'completed';
  deadline?: string;
  feedback: { id: string; userId: string; message: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export async function listClients(agencyId: string): Promise<AgencyClient[]> {
  const clients = await dsListWhere(CLIENTS_COLLECTION, { agencyId }, 'createdAt', 'desc');
  return clients as unknown as AgencyClient[];
}

export async function createClient(
  agencyId: string,
  data: { name: string; email: string; contactPerson?: string; portalUserId?: string }
): Promise<AgencyClient> {
  const now = new Date().toISOString();
  const client: AgencyClient = {
    id: randomUUID(),
    agencyId,
    name: data.name,
    email: data.email,
    contactPerson: data.contactPerson,
    portalUserId: data.portalUserId,
    status: 'active',
    createdAt: now,
  };
  await dsSet(CLIENTS_COLLECTION, client.id, client as unknown as Record<string, unknown>);

  const agency = await getAgency(agencyId);
  if (agency) {
    agency.clientCount += 1;
    agency.updatedAt = now;
    await dsSet('agencies', agency.id, agency as unknown as Record<string, unknown>);
  }

  return client;
}

export async function listAgencyProjects(agencyId: string): Promise<ClientProject[]> {
  const projects = await dsListWhere(PROJECTS_COLLECTION, { agencyId }, 'updatedAt', 'desc');
  return projects as unknown as ClientProject[];
}

export async function createAgencyProject(
  agencyId: string,
  data: { clientId: string; title: string; description?: string; type?: string; deadline?: string }
): Promise<ClientProject> {
  const now = new Date().toISOString();
  const project: ClientProject = {
    id: randomUUID(),
    agencyId,
    clientId: data.clientId,
    title: data.title,
    description: data.description,
    type: data.type ?? 'branding',
    status: 'draft',
    deadline: data.deadline,
    feedback: [],
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(PROJECTS_COLLECTION, project.id, project as unknown as Record<string, unknown>);

  const agency = await getAgency(agencyId);
  if (agency) {
    agency.projectCount += 1;
    agency.updatedAt = now;
    await dsSet('agencies', agency.id, agency as unknown as Record<string, unknown>);
  }

  return project;
}

export async function updateProjectStatus(
  projectId: string,
  agencyId: string,
  status: ClientProject['status']
): Promise<ClientProject> {
  const project = await dsGet(PROJECTS_COLLECTION, projectId);
  if (!project || project.agencyId !== agencyId) throw new Error('Projekt nicht gefunden');

  const updated = { ...project, status, updatedAt: new Date().toISOString() };
  await dsSet(PROJECTS_COLLECTION, projectId, updated);
  return updated as unknown as ClientProject;
}

export async function listProjectsForPortalUser(userId: string): Promise<ClientProject[]> {
  const clientRecords = await dsListWhere(CLIENTS_COLLECTION, { portalUserId: userId });
  const clientIds = clientRecords.map((c) => c.id as string);
  if (clientIds.length === 0) {
    const projects = await dsListWhere(PROJECTS_COLLECTION, { clientId: userId }, 'updatedAt', 'desc');
    return projects as unknown as ClientProject[];
  }
  const allProjects = await dsList(PROJECTS_COLLECTION, { orderBy: 'updatedAt', order: 'desc' });
  return allProjects
    .filter((p) => clientIds.includes(p.clientId as string)) as unknown as ClientProject[];
}

export async function addProjectFeedback(
  projectId: string,
  userId: string,
  message: string
): Promise<ClientProject> {
  const project = await dsGet(PROJECTS_COLLECTION, projectId);
  if (!project) throw new Error('Projekt nicht gefunden');

  const feedback = [
    ...(project.feedback as ClientProject['feedback'] ?? []),
    { id: randomUUID(), userId, message, createdAt: new Date().toISOString() },
  ];

  const updated = { ...project, feedback, status: 'revision', updatedAt: new Date().toISOString() };
  await dsSet(PROJECTS_COLLECTION, projectId, updated);
  return updated as unknown as ClientProject;
}

export async function getAgencyOverview(userId: string) {
  const agencies = await listAgenciesForUser(userId);
  const primary = agencies[0];
  if (!primary) return { agency: null, clients: [], projects: [] };

  return {
    agency: primary,
    clients: await listClients(primary.id),
    projects: await listAgencyProjects(primary.id),
  };
}

export async function getProject(projectId: string): Promise<ClientProject | null> {
  const project = await dsGet(PROJECTS_COLLECTION, projectId);
  return project ? (project as unknown as ClientProject) : null;
}
