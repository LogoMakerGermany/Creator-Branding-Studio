import type { UserRole } from './roles';

export type AuthProvider =
  | 'google'
  | 'discord'
  | 'twitch'
  | 'tiktok'
  | 'github'
  | 'apple'
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
