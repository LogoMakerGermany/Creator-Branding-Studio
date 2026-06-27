import type { CreatorDNA } from './creator-dna';

export interface Team {
  id: string;
  name: string;
  slug: string;
  type: 'clan' | 'esports' | 'streaming' | 'music' | 'content';
  logoUrl?: string;
  bannerUrl?: string;
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

export interface TeamDNA extends CreatorDNA {
  teamId: string;
  memberColors?: Record<string, string[]>;
  roleBranding?: TeamRoleBranding[];
}

export interface TeamRoleBranding {
  role: string;
  color: string;
  badgeUrl?: string;
}
