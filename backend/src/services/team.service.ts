import { randomUUID } from 'node:crypto';
import type { CreatorDNA } from '@ucbs/shared';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
import { createLinkedDna, getDnaById } from './dna.service.js';

export interface Team {
  id: string;
  name: string;
  slug: string;
  type: 'clan' | 'esports' | 'streaming' | 'music' | 'content';
  description?: string;
  leaderId: string;
  dnaId?: string;
  memberCount: number;
  maxMembers: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: 'leader' | 'co-leader' | 'member';
  displayRole?: string;
  joinedAt: string;
}

const TEAM_COLLECTION = 'teams';
const MEMBER_COLLECTION = 'teamMembers';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function listTeamsForUser(userId: string): Promise<Team[]> {
  const members = await dsListWhere(MEMBER_COLLECTION, { userId });
  const memberOf = members.map((m) => m.teamId as string);

  const teams = await dsList(TEAM_COLLECTION, { orderBy: 'createdAt', order: 'desc' });
  return teams
    .filter((t) => t.leaderId === userId || memberOf.includes(t.id as string)) as unknown as Team[];
}

export async function getTeam(id: string): Promise<Team | null> {
  const team = await dsGet(TEAM_COLLECTION, id);
  return team ? (team as unknown as Team) : null;
}

export async function createTeam(
  userId: string,
  data: { name: string; type: Team['type']; description?: string; maxMembers?: number }
): Promise<Team> {
  const now = new Date().toISOString();
  const team: Team = {
    id: randomUUID(),
    name: data.name,
    slug: slugify(data.name),
    type: data.type,
    description: data.description,
    leaderId: userId,
    memberCount: 1,
    maxMembers: data.maxMembers ?? 10,
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };

  await dsSet(TEAM_COLLECTION, team.id, team as unknown as Record<string, unknown>);

  const member: TeamMember = {
    id: randomUUID(),
    teamId: team.id,
    userId,
    role: 'leader',
    displayRole: 'Team Leader',
    joinedAt: now,
  };
  await dsSet(MEMBER_COLLECTION, member.id, member as unknown as Record<string, unknown>);

  return team;
}

export async function createTeamDna(
  teamId: string,
  userId: string,
  baseDnaId?: string
): Promise<{ team: Team; dna: CreatorDNA }> {
  const team = await getTeam(teamId);
  if (!team || team.leaderId !== userId) {
    throw new Error('Team nicht gefunden oder keine Berechtigung');
  }

  let baseColors: string[] = [];
  let style = 'gaming';

  if (baseDnaId) {
    const base = await getDnaById(baseDnaId, userId);
    if (base) {
      baseColors = [...base.primaryColors, ...base.secondaryColors];
      style = base.styleDirection;
    }
  }

  const dna = await createLinkedDna(
    {
      userId,
      name: `${team.name} Team DNA`,
      styleDirection: style as CreatorDNA['styleDirection'],
      primaryColors: baseColors.slice(0, 2),
      secondaryColors: baseColors.slice(2, 4),
      accentColors: baseColors.slice(4, 6),
      targetPlatforms: ['twitch', 'youtube', 'discord'],
    },
    'team'
  );

  team.dnaId = dna.id;
  team.updatedAt = new Date().toISOString();
  await dsSet(TEAM_COLLECTION, team.id, team as unknown as Record<string, unknown>);

  return { team, dna };
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const members = await dsListWhere(MEMBER_COLLECTION, { teamId });
  return members as unknown as TeamMember[];
}
