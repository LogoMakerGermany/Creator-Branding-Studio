export type RegistrationMode = 'closed' | 'invite_only' | 'public';

export const REGISTRATION_MODES: RegistrationMode[] = ['closed', 'invite_only', 'public'];

export interface InviteCode {
  id: string;
  code: string;
  description: string;
  assignedEmail?: string;
  maximumUses: number;
  currentUses: number;
  expiresAt?: string;
  isActive: boolean;
  /** Role granted on first use when registering */
  grantRole?: 'user' | 'tester';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInviteCodeInput {
  code?: string;
  description: string;
  assignedEmail?: string;
  maximumUses?: number;
  expiresAt?: string;
  grantRole?: 'user' | 'tester';
}
