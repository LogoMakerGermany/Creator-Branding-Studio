import type { UserRole } from './roles';
import type { NexterPreferences } from './nexter-preferences';
import type { LegalAcceptanceRecord } from './legal';
import type { ContentRightsAckRecord, VoiceCloneConsentRecord } from './content-rights';

export type AuthProvider =
  | 'google'
  | 'discord'
  | 'twitch'
  | 'tiktok'
  | 'microsoft'
  | 'email';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  authProviders: AuthProvider[];
  agencyId?: string;
  teamId?: string;
  coinBalance: number;
  subscriptionTier: SubscriptionTier;
  stripeCustomerId?: string;
  locale: string;
  onboardingCompleted: boolean;
  /** App + Nexter personalization. Distinct from Creator DNA brand colors. */
  nexterPreferences?: NexterPreferences;
  /** Acknowledged legal text versions. Draft acknowledgements are not a final legal review. */
  legalAcceptance?: LegalAcceptanceRecord;
  /** Versioned content-rights acknowledgement. Not a license grant and not legal advice. */
  contentRightsAck?: ContentRightsAckRecord;
  /** Voice-clone consent. Catalog TTS does not use this field. */
  voiceCloneConsent?: VoiceCloneConsentRecord;
  createdAt: string;
  updatedAt: string;
}

export enum SubscriptionTier {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  TEAM = 'team',
  AGENCY = 'agency',
  ENTERPRISE = 'enterprise',
}

export interface UserSettings {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    marketing: boolean;
  };
  defaultExportFormat: 'png' | 'svg' | 'pdf';
  preferredPlatforms: string[];
}
