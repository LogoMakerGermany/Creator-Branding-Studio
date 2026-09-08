import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTH_TOKEN_STORAGE_KEY,
  mustInitializeFirebaseAuthListener,
  resolveAuthRequestToken,
  shouldRetryUnauthorizedRequest,
} from '../../../frontend/src/lib/auth-session.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const frontendSrc = join(dir, '../../../frontend/src');

function src(rel: string): string {
  return readFileSync(join(frontendSrc, rel), 'utf8');
}

describe('auth token lifecycle P0', () => {
  it('A) App start without stored token still requires Firebase listener when configured', () => {
    assert.equal(mustInitializeFirebaseAuthListener(true, null), true);
    const ctx = src('context/AuthContext.tsx');
    assert.match(ctx, /if \(isFirebaseConfigured\(\)\)/);
    assert.match(ctx, /subscribeToAuth/);
    assert.doesNotMatch(ctx, /if \(storedToken\) \{[\s\S]*return;[\s\S]*isFirebaseConfigured/);
  });

  it('B) App start WITH leftover localStorage token still initializes Firebase listener', () => {
    assert.equal(mustInitializeFirebaseAuthListener(true, 'legacy.jwt.token'), true);
    const ctx = src('context/AuthContext.tsx');
    assert.doesNotMatch(
      ctx,
      /const storedToken = localStorage\.getItem\([^)]+\);\s*if \(storedToken\) \{\s*await refreshUser\(\);\s*setLoading\(false\);\s*return;/
    );
    assert.match(ctx, /isFirebaseConfigured\(\)/);
    assert.match(ctx, /subscribeToAuth/);
  });

  it('C) Firebase user present → getToken uses Firebase ID token', () => {
    const token = resolveAuthRequestToken({
      firebaseConfigured: true,
      firebaseIdToken: 'firebase-fresh-id-token',
      legacyStoredToken: 'legacy-stale',
    });
    assert.equal(token, 'firebase-fresh-id-token');
    const api = src('services/api.ts');
    assert.match(api, /isFirebaseConfigured\(\)/);
    assert.match(api, /getIdToken/);
    assert.match(api, /resolveAuthRequestToken/);
    const firebase = src('lib/firebase.ts');
    assert.match(firebase, /currentUser\.getIdToken\(\)/);
    assert.doesNotMatch(firebase, /return localStorage\.getItem/);
  });

  it('D) Renewed Firebase token is what subsequent requests send', () => {
    const first = resolveAuthRequestToken({
      firebaseConfigured: true,
      firebaseIdToken: 'token-v1',
      legacyStoredToken: 'legacy',
    });
    const second = resolveAuthRequestToken({
      firebaseConfigured: true,
      firebaseIdToken: 'token-v2',
      legacyStoredToken: 'legacy',
    });
    assert.equal(first, 'token-v1');
    assert.equal(second, 'token-v2');
    const firebase = src('lib/firebase.ts');
    assert.match(firebase, /onIdTokenChanged/);
    assert.doesNotMatch(firebase, /onAuthStateChanged/);
    assert.doesNotMatch(src('context/AuthContext.tsx'), /getIdToken\(true\)/);
    assert.doesNotMatch(src('context/AuthContext.tsx'), /55 \* 60 \* 1000/);
  });

  it('E) Leftover localStorage token is never preferred when Firebase is configured', () => {
    assert.equal(
      resolveAuthRequestToken({
        firebaseConfigured: true,
        firebaseIdToken: null,
        legacyStoredToken: 'expired-legacy-id-token',
      }),
      null
    );
    const api = src('services/api.ts');
    assert.doesNotMatch(api, /const stored = localStorage\.getItem\(['"]auth_token['"]\);\s*if \(stored\) return stored/);
    assert.doesNotMatch(src('pages/studios/AnimationStudioPage.tsx'), /localStorage\.getItem\(['"]auth_token['"]\)/);
  });

  it('F) Logout clears Firebase session and leftover storage key', () => {
    const ctx = src('context/AuthContext.tsx');
    assert.match(ctx, /await logoutFirebase\(\)/);
    assert.match(ctx, /setAuthToken\(null\)/);
    const api = src('services/api.ts');
    assert.match(api, /localStorage\.removeItem\(AUTH_TOKEN_STORAGE_KEY\)/);
    assert.equal(AUTH_TOKEN_STORAGE_KEY, 'auth_token');
  });

  it('G) Signed-out user with Firebase configured cannot use leftover token for APIs', () => {
    const token = resolveAuthRequestToken({
      firebaseConfigured: true,
      firebaseIdToken: null,
      legacyStoredToken: 'should-not-authorize',
    });
    assert.equal(token, null);
    assert.equal(
      shouldRetryUnauthorizedRequest({
        status: 403,
        errorCode: 'ACCESS_DENIED',
        hasFirebaseUser: false,
        alreadyRetried: false,
      }),
      false
    );
  });

  it('401 retry is not used — Firebase getIdToken refreshes expired tokens without forceRefresh', () => {
    assert.equal(
      shouldRetryUnauthorizedRequest({
        status: 401,
        errorCode: 'INVALID_TOKEN',
        hasFirebaseUser: true,
        alreadyRetried: false,
      }),
      false
    );
    const api = src('services/api.ts');
    assert.doesNotMatch(api, /alreadyRetried/);
    assert.doesNotMatch(api, /retry.*401|401.*retry/i);
  });

  it('Dev-store without Firebase client still accepts a stored token', () => {
    assert.equal(
      resolveAuthRequestToken({
        firebaseConfigured: false,
        firebaseIdToken: null,
        legacyStoredToken: 'dev-session-token',
      }),
      'dev-session-token'
    );
    assert.equal(mustInitializeFirebaseAuthListener(false, 'dev-session-token'), false);
  });
});
