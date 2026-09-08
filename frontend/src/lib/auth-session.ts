/** localStorage key used only for non-Firebase (dev) sessions and leftover copies. */
export const AUTH_TOKEN_STORAGE_KEY = 'auth_token';

export interface AuthRequestTokenInput {
  firebaseConfigured: boolean;
  /** Result of `currentUser.getIdToken()` — never force-refresh unless handling a retry. */
  firebaseIdToken: string | null;
  /** Leftover or dev-store token. Ignored whenever Firebase client auth is configured. */
  legacyStoredToken: string | null;
}

/**
 * Firebase ID tokens are the only request credential when the Firebase client is configured.
 * A leftover localStorage copy must never win, even if Firebase has not restored a user yet.
 */
export function resolveAuthRequestToken(input: AuthRequestTokenInput): string | null {
  if (input.firebaseConfigured) {
    return input.firebaseIdToken;
  }
  return input.legacyStoredToken;
}

/** Listener must always attach when Firebase is configured — leftover tokens must not skip it. */
export function mustInitializeFirebaseAuthListener(
  firebaseConfigured: boolean,
  _legacyStoredToken: string | null
): boolean {
  return firebaseConfigured;
}

/**
 * Expired Firebase ID tokens are refreshed inside `User.getIdToken()` (no forceRefresh).
 * A 401 retry loop is therefore not part of the happy path. Never retry 403 permission errors.
 */
export function shouldRetryUnauthorizedRequest(input: {
  status: number;
  errorCode?: string;
  hasFirebaseUser: boolean;
  alreadyRetried: boolean;
}): boolean {
  if (input.alreadyRetried) return false;
  if (!input.hasFirebaseUser) return false;
  if (input.status !== 401) return false;
  if (input.errorCode === 'ACCESS_DENIED' || input.errorCode === 'ACCOUNT_DISABLED') {
    return false;
  }
  return false;
}
