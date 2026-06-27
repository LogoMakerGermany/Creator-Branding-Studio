import { randomUUID } from 'node:crypto';
import type { CreatorDNA } from '@ucbs/shared';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
import { createDna, getDnaById } from './dna.service.js';

export interface Agency {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  dnaId?: string;
  settings: {
    defaultCoinAllocation: number;
    allowClientPortal: boolean;
    requireApproval: boolean;
    brandingTemplates: string[];
  };
  memberCount: number;
  clientCount: number;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyMember {
  id: string;
  agencyId: string;
  userId: string;
  role: 'owner' | 'manager' | 'employee';
  joinedAt: string;
}

const AGENCY_COLLECTION = 'agencies';
const MEMBER_COLLECTION = 'agencyMembers';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function listAgenciesForUser(userId: string): Promise<Agency[]> {
  const members = await dsListWhere(MEMBER_COLLECTION, { userId });
  const memberOf = members.map((m) => m.agencyId as string);

  const agencies = await dsList(AGENCY_COLLECTION, { orderBy: 'createdAt', order: 'desc' });
  return agencies
    .filter((a) => a.ownerId === userId || memberOf.includes(a.id as string)) as unknown as Agency[];
}

export async function getAgency(id: string): Promise<Agency | null> {
  const agency = await dsGet(AGENCY_COLLECTION, id);
  return agency ? (agency as unknown as Agency) : null;
}

export async function createAgency(
  userId: string,
  data: { name: string; description?: string }
): Promise<Agency> {
  const now = new Date().toISOString();
  const agency: Agency = {
    id: randomUUID(),
    name: data.name,
    slug: slugify(data.name),
    description: data.description,
    ownerId: userId,
    settings: {
      defaultCoinAllocation: 100,
      allowClientPortal: true,
      requireApproval: false,
      brandingTemplates: [],
    },
    memberCount: 1,
    clientCount: 0,
    projectCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await dsSet(AGENCY_COLLECTION, agency.id, agency as unknown as Record<string, unknown>);

  const member: AgencyMember = {
    id: randomUUID(),
    agencyId: agency.id,
    userId,
    role: 'owner',
    joinedAt: now,
  };
  await dsSet(MEMBER_COLLECTION, member.id, member as unknown as Record<string, unknown>);

  return agency;
}

export async function createAgencyDna(
  agencyId: string,
  userId: string,
  baseDnaId?: string
): Promise<{ agency: Agency; dna: CreatorDNA }> {
  const agency = await getAgency(agencyId);
  if (!agency || agency.ownerId !== userId) {
    throw new Error('Agentur nicht gefunden oder keine Berechtigung');
  }

  let baseColors: string[] = [];
  let style = 'corporate';

  if (baseDnaId) {
    const base = await getDnaById(baseDnaId, userId);
    if (base) {
      baseColors = [...base.primaryColors, ...base.secondaryColors];
      style = base.styleDirection;
    }
  }

  const dna = await createDna({
    userId,
    name: `${agency.name} Agentur DNA`,
    styleDirection: style as CreatorDNA['styleDirection'],
    primaryColors: baseColors.slice(0, 2).length ? baseColors.slice(0, 2) : ['#7C3AED', '#1E1B4B'],
    secondaryColors: baseColors.slice(2, 4).length ? baseColors.slice(2, 4) : ['#A78BFA', '#312E81'],
    accentColors: baseColors.slice(4, 6).length ? baseColors.slice(4, 6) : ['#F5F3FF'],
    targetPlatforms: ['instagram', 'youtube', 'tiktok', 'discord'],
  });

  agency.dnaId = dna.id;
  agency.updatedAt = new Date().toISOString();
  await dsSet(AGENCY_COLLECTION, agency.id, agency as unknown as Record<string, unknown>);

  return { agency, dna };
}

export async function getAgencyMembers(agencyId: string): Promise<AgencyMember[]> {
  const members = await dsListWhere(MEMBER_COLLECTION, { agencyId });
  return members as unknown as AgencyMember[];
}
