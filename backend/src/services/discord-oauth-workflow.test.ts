import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentDraftLegalAcceptanceInput } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { dsGet, dsSet } from '../lib/data-store.js';
import { getOAuthPublicAvailability, isDiscordOAuthConfigured } from '../config/env.js';
import { createInviteCode } from './invite.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { getOrCreateUser } from './user.service.js';
import { exportAccountData, requestAccountDeletion, ACCOUNT_DELETE_CONFIRMATION } from './account.service.js';
import {
  completeOAuthTicket,
  deleteOAuthIdentitiesForUser,
  DISCORD_OAUTH_SCOPES,
  getOAuthCallbackUrl,
  handleOAuthCallback,
  listOAuthIdentitiesForUser,
  setOAuthAuthAdapterForTests,
  setOAuthFetchForTests,
  startOAuth,
  type OAuthAuthAdapter,
} from './oauth.service.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';
process.env.DISCORD_CLIENT_ID = 'discord-client';
process.env.DISCORD_CLIENT_SECRET = 'discord-secret';
process.env.FRONTEND_URL = 'https://nexter-creator-studio-production.up.railway.app';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function memoryAdapter(seed?: { email: string; uid: string; emailVerified?: boolean }): OAuthAuthAdapter {
  const users = new Map<string, { uid: string; email?: string; emailVerified: boolean }>();
  const byEmail = new Map<string, string>();
  if (seed) {
    users.set(seed.uid, { uid: seed.uid, email: seed.email, emailVerified: seed.emailVerified === true });
    byEmail.set(seed.email.toLowerCase(), seed.uid);
  }
  return {
    async getUserByEmail(email) {
      const uid = byEmail.get(email.toLowerCase());
      if (!uid) return null;
      const row = users.get(uid);
      return row ? { uid: row.uid, emailVerified: row.emailVerified } : null;
    },
    async createUser(input) {
      const uid = `fb-${randomUUID()}`;
      users.set(uid, { uid, email: input.email, emailVerified: input.emailVerified });
      if (input.email) byEmail.set(input.email.toLowerCase(), uid);
      return { uid };
    },
    async createCustomToken(uid) {
      return `custom.${uid}`;
    },
    async deleteUser(uid) {
      const row = users.get(uid);
      if (row?.email) byEmail.delete(row.email.toLowerCase());
      users.delete(uid);
    },
  };
}

function discordFetchMock(
  profile: { id: string; email?: string; verified?: boolean },
  opts?: { tokenStatus?: number; profileStatus?: number }
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok_test', refresh_token: 'ref_test' }), {
        status: opts?.tokenStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/users/@me')) {
      return new Response(JSON.stringify(profile), {
        status: opts?.profileStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not-found', { status: 404 });
  }) as typeof fetch;
}

async function startDiscord(extra?: Record<string, string>) {
  const started = await startOAuth({ provider: 'discord', ...extra });
  const url = new URL(started.url);
  const state = url.searchParams.get('state') || '';
  return { started, state, url };
}

function uidFromToken(customToken: string): string {
  return customToken.replace(/^custom\./, '');
}

describe('Discord OAuth local closure', () => {
  beforeEach(() => {
    process.env.DISCORD_CLIENT_ID = 'discord-client';
    process.env.DISCORD_CLIENT_SECRET = 'discord-secret';
    setOAuthAuthAdapterForTests(memoryAdapter());
    setOAuthFetchForTests(discordFetchMock({ id: 'd1', email: 'discord@example.com', verified: true }));
  });

  it('1-2 provider unavailable and incomplete config disable Discord', () => {
    const prevId = process.env.DISCORD_CLIENT_ID;
    const prevSecret = process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_CLIENT_SECRET;
    assert.equal(isDiscordOAuthConfigured(), false);
    assert.equal(getOAuthPublicAvailability().discord, false);
    process.env.DISCORD_CLIENT_SECRET = prevSecret;
    delete process.env.DISCORD_CLIENT_ID;
    assert.equal(isDiscordOAuthConfigured(), false);
    process.env.DISCORD_CLIENT_ID = prevId;
    assert.equal(isDiscordOAuthConfigured(), true);
    assert.equal(getOAuthPublicAvailability().discord, true);
  });

  it('3-7 state, PKCE, invalid/expired/replay, and missing code', async () => {
    const { url, state } = await startDiscord();
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.equal(url.searchParams.get('scope'), DISCORD_OAUTH_SCOPES.join(' '));
    assert.doesNotMatch(url.searchParams.get('scope') || '', /guild|bot|webhook|messages/);
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'https://nexter-creator-studio-production.up.railway.app/api/v1/auth/oauth/discord/callback'
    );

    const missing = await handleOAuthCallback({ provider: 'discord', state });
    assert.match(missing.redirectTo, /oauth_error=invalid_callback/);

    const invalidState = await handleOAuthCallback({ provider: 'discord', state: 'nope', code: 'x' });
    assert.match(invalidState.redirectTo, /oauth_error=invalid_state/);

    const expiredId = `expired-${randomUUID()}`;
    await dsSet('oauth_states', expiredId, {
      id: expiredId,
      provider: 'discord',
      codeVerifier: 'abc',
      nonce: 'n',
      redirectUri: getOAuthCallbackUrl('discord'),
      intent: 'login',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expired = await handleOAuthCallback({ provider: 'discord', state: expiredId, code: 'x' });
    assert.match(expired.redirectTo, /oauth_error=expired/);

    const first = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(first.redirectTo, /oauth_error=invite_required/);
    const replay = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(replay.redirectTo, /oauth_error=replay/);
  });

  it('8-11 invalid code, Discord API failure, identity success, stable Discord user ID', async () => {
    setOAuthFetchForTests(discordFetchMock({ id: 'd-bad' }, { tokenStatus: 401 }));
    const { state } = await startDiscord();
    const invalidCode = await handleOAuthCallback({ provider: 'discord', state, code: 'bad' });
    assert.match(invalidCode.redirectTo, /oauth_error=invalid_code/);
    assert.doesNotMatch(invalidCode.redirectTo, /access_token|refresh_token|tok_test|ref_test/);

    setOAuthFetchForTests(discordFetchMock({ id: 'd-api' }, { profileStatus: 500 }));
    const { state: state2 } = await startDiscord();
    const apiFail = await handleOAuthCallback({ provider: 'discord', state: state2, code: 'ok' });
    assert.match(apiFail.redirectTo, /oauth_error=oauth_failed/);

    setOAuthFetchForTests(discordFetchMock({ id: 'discord-stable-id', email: 'stable@example.com', verified: true }));
    const invite = await createInviteCode({ description: 'discord-stable', maximumUses: 1 }, 'admin-discord');
    const { state: state3 } = await startDiscord({ intent: 'register', inviteCode: invite.code });
    const ok = await handleOAuthCallback({ provider: 'discord', state: state3, code: 'ok' });
    const ticket = new URL(ok.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const firebaseUid = uidFromToken(done.customToken);
    const identities = await listOAuthIdentitiesForUser(firebaseUid);
    assert.equal(identities.length, 1);
    assert.equal(identities[0]?.provider, 'discord');
    assert.equal(identities[0]?.providerUserId, 'discord-stable-id');
    const raw = await dsGet('oauth_identities', 'discord:discord-stable-id');
    assert.equal(raw?.firebaseUid, firebaseUid);
    assert.equal(Object.prototype.hasOwnProperty.call(raw, 'access_token'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(raw, 'refresh_token'), false);
  });

  it('12-16 invite_only, collision, and unsafe auto-link', async () => {
    const { state } = await startDiscord();
    const blocked = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(blocked.redirectTo, /oauth_error=invite_required/);
    assert.equal(await dsGet('oauth_identities', 'discord:d1'), null);

    const invite = await createInviteCode({ description: 'discord-invited', maximumUses: 1 }, 'admin-discord');
    const { state: invitedState } = await startDiscord({ intent: 'register', inviteCode: invite.code });
    const first = await handleOAuthCallback({ provider: 'discord', state: invitedState, code: 'ok' });
    const ticket = new URL(first.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    const created = await syncAuthenticatedAppUser({
      uid,
      email: 'discord@example.com',
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(created.created, true);
    assert.equal(await getCoinBalance(uid), 50);

    const { state: reloginState } = await startDiscord();
    const reloginCb = await handleOAuthCallback({ provider: 'discord', state: reloginState, code: 'ok' });
    const ticket2 = new URL(reloginCb.redirectTo).searchParams.get('ticket')!;
    const again = await completeOAuthTicket(ticket2);
    const same = await syncAuthenticatedAppUser({
      uid: uidFromToken(again.customToken),
      email: 'discord@example.com',
      authProvider: 'discord',
    });
    assert.equal(same.created, false);
    assert.equal(uidFromToken(again.customToken), uid);
    assert.equal(await getCoinBalance(uid), 50);

    setOAuthAuthAdapterForTests(
      memoryAdapter({ email: 'taken@example.com', uid: 'existing-uid', emailVerified: true })
    );
    setOAuthFetchForTests(discordFetchMock({ id: 'd-col', email: 'taken@example.com', verified: true }));
    const colInvite = await createInviteCode({ description: 'discord-col', maximumUses: 1 }, 'admin-discord');
    const { state: colState } = await startDiscord({ intent: 'register', inviteCode: colInvite.code });
    const collision = await handleOAuthCallback({ provider: 'discord', state: colState, code: 'ok' });
    assert.match(collision.redirectTo, /oauth_error=account_collision/);

    setOAuthAuthAdapterForTests(
      memoryAdapter({ email: 'unv@example.com', uid: 'existing-unv', emailVerified: false })
    );
    setOAuthFetchForTests(discordFetchMock({ id: 'd-unv', email: 'unv@example.com', verified: false }));
    const unvInvite = await createInviteCode({ description: 'discord-unv', maximumUses: 1 }, 'admin-discord');
    const { state: unvState } = await startDiscord({ intent: 'register', inviteCode: unvInvite.code });
    const unsafe = await handleOAuthCallback({ provider: 'discord', state: unvState, code: 'ok' });
    assert.match(unsafe.redirectTo, /oauth_error=account_collision/);
  });

  it('17-21 explicit linking, already-linked conflict, welcome once, replay safety', async () => {
    const googleUid = `google-${randomUUID()}`;
    const invite = await createInviteCode({ description: 'discord-link', maximumUses: 1 }, 'admin-discord');
    const created = await syncAuthenticatedAppUser({
      uid: googleUid,
      email: 'google-link@example.com',
      inviteCode: invite.code,
      authProvider: 'google',
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(created.created, true);
    assert.equal(await getCoinBalance(googleUid), 50);

    setOAuthFetchForTests(discordFetchMock({ id: 'd-link-me', email: 'other@example.com', verified: false }));
    const started = await startOAuth({ provider: 'discord', intent: 'link', linkUid: googleUid });
    const state = new URL(started.url).searchParams.get('state')!;
    const cb = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const linked = await completeOAuthTicket(ticket);
    assert.equal(uidFromToken(linked.customToken), googleUid);
    const afterLink = await syncAuthenticatedAppUser({
      uid: googleUid,
      email: 'google-link@example.com',
      authProvider: 'discord',
    });
    assert.equal(afterLink.created, false);
    assert.equal(await getCoinBalance(googleUid), 50);
    const welcome = (await getTransactions(googleUid)).filter((tx) =>
      String((tx as { idempotencyKey?: string }).idempotencyKey ?? '').startsWith('welcome:')
    );
    assert.equal(welcome.length, 1);

    const otherUid = `other-${randomUUID()}`;
    await getOrCreateUser(otherUid, 'other-owner@example.com', 'Other', 'email');
    const conflictStart = await startOAuth({ provider: 'discord', intent: 'link', linkUid: otherUid });
    const conflictState = new URL(conflictStart.url).searchParams.get('state')!;
    const conflict = await handleOAuthCallback({ provider: 'discord', state: conflictState, code: 'ok' });
    assert.match(conflict.redirectTo, /oauth_error=link_conflict/);

    await assert.rejects(
      () => completeOAuthTicket(ticket),
      (err: unknown) => err instanceof AppError && err.code === 'OAUTH_TICKET_REPLAY'
    );
    assert.equal(await getCoinBalance(googleUid), 50);
    assert.equal((await listOAuthIdentitiesForUser(googleUid)).length, 1);
  });

  it('22-23 logout contract and Discord relogin same user', async () => {
    const ctx = repo('frontend/src/context/AuthContext.tsx');
    assert.match(ctx, /await logoutFirebase\(\)/);
    assert.match(ctx, /setUser\(null\)/);
    assert.match(repo('frontend/src/components/auth/ProtectedRoute.tsx'), /Navigate to="\/login"/);

    setOAuthFetchForTests(discordFetchMock({ id: 'd-relogin', email: 'relogin@example.com', verified: true }));
    const invite = await createInviteCode({ description: 'discord-relogin', maximumUses: 1 }, 'admin-discord');
    const { state } = await startDiscord({ intent: 'register', inviteCode: invite.code });
    const first = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(first.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    await syncAuthenticatedAppUser({
      uid,
      email: 'relogin@example.com',
      inviteCode: invite.code,
      authProvider: 'discord',
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    const { state: againState } = await startDiscord();
    const second = await handleOAuthCallback({ provider: 'discord', state: againState, code: 'ok' });
    const ticket2 = new URL(second.redirectTo).searchParams.get('ticket')!;
    const again = await completeOAuthTicket(ticket2);
    assert.equal(uidFromToken(again.customToken), uid);
    assert.equal(await getCoinBalance(uid), 50);
  });

  it('24-27 missing secret, leakage, logs, and production redirect allowlist', async () => {
    const prev = process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_CLIENT_SECRET;
    await assert.rejects(
      () => startOAuth({ provider: 'discord' }),
      (err: unknown) => err instanceof AppError && err.code === 'OAUTH_NOT_CONFIGURED'
    );
    process.env.DISCORD_CLIENT_SECRET = prev;

    const src = repo('backend/src/services/oauth.service.ts');
    const routes = repo('backend/src/routes/oauth.routes.ts');
    const complete = repo('frontend/src/pages/auth/OAuthCompletePage.tsx');
    assert.doesNotMatch(src, /console\.(log|debug|info)/);
    assert.doesNotMatch(routes, /console\.(log|debug|info)/);
    assert.doesNotMatch(complete, /console\.(log|debug|info)/);
    assert.doesNotMatch(src, /access_token.*=.*dsSet/);
    assert.match(src, /FORBIDDEN_CALLBACK_HOSTS/);
    assert.match(src, /PRODUCTION_ALLOWED_CALLBACK_HOSTS/);
    assert.match(src, /creatorbrandingstudioultimate-production/);
    assert.match(src, /code_verifier/);
    assert.match(repo('backend/src/lib/observability.ts'), /entry\.route\.split\('\?'\)/);

    const prevNode = process.env.NODE_ENV;
    const prevFront = process.env.FRONTEND_URL;
    process.env.NODE_ENV = 'production';
    try {
      process.env.FRONTEND_URL = 'http://localhost:5173';
      assert.throws(
        () => getOAuthCallbackUrl('discord'),
        (err: unknown) => err instanceof AppError && err.code === 'OAUTH_ORIGIN_INVALID'
      );
      process.env.FRONTEND_URL = 'https://evil.example.com';
      assert.throws(
        () => getOAuthCallbackUrl('discord'),
        (err: unknown) => err instanceof AppError && err.code === 'OAUTH_ORIGIN_INVALID'
      );
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      process.env.FRONTEND_URL = prevFront;
    }
  });

  it('28-30 account delete, data export, and Discord button availability', async () => {
    setOAuthFetchForTests(discordFetchMock({ id: 'd-export', email: 'export-d@example.com', verified: true }));
    const invite = await createInviteCode({ description: 'discord-export', maximumUses: 1 }, 'admin-discord');
    const { state } = await startDiscord({ intent: 'register', inviteCode: invite.code });
    const cb = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    await syncAuthenticatedAppUser({
      uid,
      email: 'export-d@example.com',
      inviteCode: invite.code,
      authProvider: 'discord',
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    const exported = await exportAccountData(uid);
    assert.equal(Array.isArray(exported.oauthIdentities), true);
    assert.equal((exported.oauthIdentities[0] as { providerUserId: string }).providerUserId, 'd-export');
    assert.doesNotMatch(JSON.stringify(exported), /tok_test|ref_test|access_token|refresh_token|client_secret/);

    await requestAccountDeletion(uid, ACCOUNT_DELETE_CONFIRMATION);
    assert.equal((await listOAuthIdentitiesForUser(uid)).length, 0);
    await deleteOAuthIdentitiesForUser(uid);

    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    assert.match(login, /oauth\?\.discord === true/);
    assert.match(login, /Mit \$\{p\.label\} anmelden/);
    assert.match(login, /nicht verfügbar/);
    assert.match(login, /if \(loading\) return/);
    assert.match(login, /min-h-11/);
    assert.doesNotMatch(login, /GitHub/);
    assert.doesNotMatch(login, /Apple/);
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    assert.match(settings, /label\} verknüpfen/);
    assert.match(settings, /startOAuthLink\(provider\)/);
    assert.match(settings, /tiktok: 'TikTok'/);
    assert.match(settings, /twitch: 'Twitch'/);
  });
});
