import type { CreatorDNA } from './creator-dna';

export interface Agency {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  bannerUrl?: string;
  description?: string;
  ownerId: string;
  dnaId?: string;
  whiteLabel?: WhiteLabelConfig;
  settings: AgencySettings;
  memberCount: number;
  clientCount: number;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgencySettings {
  defaultCoinAllocation: number;
  allowClientPortal: boolean;
  requireApproval: boolean;
  brandingTemplates: string[];
}

export interface WhiteLabelConfig {
  enabled: boolean;
  customDomain?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
  platformName?: string;
}

export interface AgencyMember {
  id: string;
  agencyId: string;
  userId: string;
  role: 'owner' | 'manager' | 'employee';
  permissions: string[];
  joinedAt: string;
}

export interface AgencyClient {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  contactPerson?: string;
  logoUrl?: string;
  dnaId?: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

export interface AgencyDNA extends CreatorDNA {
  agencyId: string;
  clientTemplates: string[];
}
