import { UserRole, LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '@ucbs/shared';
import type { LegalAcceptanceInput, LegalAcceptanceRecord } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { isDevMode } from '../config/env.js';
import { userLockKey, withDevLock } from '../lib/dev-mutex.js';
import { getOrCreateUser, getUserById, type UserProfile } from './user.service.js';
import { getRegistrationMode } from './system-settings.service.js';
import { redeemInviteCode } from './invite.service.js';
import { dispatchTransactionalEmail, welcomeEmail } from './email.service.js';
import { assertNewUserLegalAcceptance } from './legal.service.js';

export interface SyncAppUserInput {
  uid: string;
  email: string;
  displayName?: string;
  inviteCode?: string;
  authProvider?: string;
  legalAcceptance?: LegalAcceptanceInput;
}

export interface SyncAppUserResult {
  user: UserProfile;
  created: boolean;
}

/**
 * Firebase Auth identity → Nexter app user.
 * Existing app users may log in without an invite.
 * New app users are gated by REGISTRATION_MODE (fail-safe: not public → invite required).
 */
export async function syncAuthenticatedAppUser(input: SyncAppUserInput): Promise<SyncAppUserResult> {
  const run = () => syncAuthenticatedAppUserLocked(input);
  if (isDevMode()) {
    return withDevLock(userLockKey(input.uid), run);
  }
  return run();
}

async function syncAuthenticatedAppUserLocked(input: SyncAppUserInput): Promise<SyncAppUserResult> {
  const existing = await getUserById(input.uid);
  if (existing) {
    const user = await getOrCreateUser(input.uid, input.email, input.displayName || existing.displayName, {
      authProvider: input.authProvider,
    });
    return { user, created: false };
  }

  const mode = await getRegistrationMode();
  if (mode === 'closed') {
    throw new AppError(403, 'ACCESS_DENIED', 'Registrierung ist derzeit geschlossen');
  }

  let role = UserRole.USER;
  let inviteCodeId: string | undefined;

  if (mode !== 'public' && !input.inviteCode?.trim()) {
    throw new AppError(
      403,
      'ACCESS_DENIED',
      'Einladungscode erforderlich — die Plattform ist derzeit nur mit Einladung zugänglich'
    );
  }

  assertNewUserLegalAcceptance(input.legalAcceptance);
  const legalAcceptance: LegalAcceptanceRecord = {
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    acceptedAt: new Date().toISOString(),
  };

  if (mode !== 'public') {
    try {
      const redeemed = await redeemInviteCode(input.inviteCode!, input.email, input.uid);
      role = redeemed.grantRole === 'tester' ? UserRole.TESTER : UserRole.USER;
      inviteCodeId = redeemed.invite.id;
    } catch (err) {
      const raced = await getUserById(input.uid);
      if (raced) {
        const user = await getOrCreateUser(input.uid, input.email, input.displayName || raced.displayName, {
          authProvider: input.authProvider,
        });
        return { user, created: false };
      }
      throw err;
    }
  }

  const user = await getOrCreateUser(input.uid, input.email, input.displayName, {
    authProvider: input.authProvider,
    role,
    inviteCodeId,
    legalAcceptance,
  });

  void dispatchTransactionalEmail(`welcome:${input.uid}`, welcomeEmail(user.email, user.displayName)).catch(
    () => undefined
  );

  return { user, created: true };
}
