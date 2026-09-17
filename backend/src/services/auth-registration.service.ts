import { UserRole, LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '@ucbs/shared';
import type { LegalAcceptanceInput, LegalAcceptanceRecord } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { userLockKey, withDevLock } from '../lib/dev-mutex.js';
import { getOrCreateUser, getUserById, type UserProfile } from './user.service.js';
import { getRegistrationMode } from './system-settings.service.js';
import { redeemInviteCode, INVITE_REQUIRED_MESSAGE } from './invite.service.js';
import { dispatchTransactionalEmail, welcomeEmail } from './email.service.js';
import { assertNewUserLegalAcceptance } from './legal.service.js';
import {
  compensatePendingOAuthRegistration,
  markOAuthRegistrationComplete,
} from './oauth.service.js';

export interface SyncAppUserInput {
  uid: string;
  email?: string;
  displayName?: string;
  inviteCode?: string;
  authProvider?: string;
  legalAcceptance?: LegalAcceptanceInput;
  emailVerified?: boolean;
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
  return withDevLock(userLockKey(input.uid), () => syncAuthenticatedAppUserLocked(input));
}

async function syncAuthenticatedAppUserLocked(input: SyncAppUserInput): Promise<SyncAppUserResult> {
  const existing = await getUserById(input.uid);
  if (existing) {
    const user = await getOrCreateUser(input.uid, input.email || existing.email, input.displayName || existing.displayName, {
      authProvider: input.authProvider,
    });
    await markOAuthRegistrationComplete(input.uid).catch(() => undefined);
    return { user, created: false };
  }

  const failClosed = async (err: unknown): Promise<never> => {
    await compensatePendingOAuthRegistration(input.uid).catch(() => undefined);
    throw err;
  };

  const mode = await getRegistrationMode();
  if (mode === 'closed') {
    await failClosed(new AppError(403, 'ACCESS_DENIED', 'Registrierung ist derzeit geschlossen'));
  }

  let role = UserRole.USER;
  let inviteCodeId: string | undefined;

  if (mode !== 'public' && !input.inviteCode?.trim()) {
    await failClosed(new AppError(403, 'ACCESS_DENIED', INVITE_REQUIRED_MESSAGE));
  }

  try {
    assertNewUserLegalAcceptance(input.legalAcceptance);
  } catch (err) {
    await failClosed(err);
  }
  const legalAcceptance: LegalAcceptanceRecord = {
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    acceptedAt: new Date().toISOString(),
  };

  if (mode !== 'public') {
    try {
      const redeemed = await redeemInviteCode(input.inviteCode!, input.email, input.uid, {
        emailVerified: input.emailVerified,
      });
      role = redeemed.grantRole === 'tester' ? UserRole.TESTER : UserRole.USER;
      inviteCodeId = redeemed.invite.id;
    } catch (err) {
      const raced = await getUserById(input.uid);
      if (raced) {
        const user = await getOrCreateUser(input.uid, input.email || raced.email, input.displayName || raced.displayName, {
          authProvider: input.authProvider,
        });
        await markOAuthRegistrationComplete(input.uid).catch(() => undefined);
        return { user, created: false };
      }
      await failClosed(err);
    }
  }

  const user = await getOrCreateUser(input.uid, input.email, input.displayName, {
    authProvider: input.authProvider,
    role,
    inviteCodeId,
    legalAcceptance,
  });
  await markOAuthRegistrationComplete(input.uid).catch(() => undefined);

  if (user.email && user.email.includes('@') && !/\.local$/i.test(user.email) && !/\.invalid$/i.test(user.email)) {
    try {
      const mail = await dispatchTransactionalEmail(`welcome:${input.uid}`, welcomeEmail(user.email, user.displayName));
      if (!mail.sent && !mail.duplicate) {
        console.error('[email] welcome not delivered', { reason: mail.reason || 'failed', provider: mail.provider });
      }
    } catch {
      console.error('[email] welcome not delivered', { reason: 'error' });
    }
  }

  return { user, created: true };
}
