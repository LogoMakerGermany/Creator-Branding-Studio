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
import {
  completeOAuthTicket,
  getOAuthCallbackUrl,
  handleOAuthCallback,
  setOAuthAuthAdapterForTests,
  setOAuthFetchForTests,
  startOAuth,
  type OAuthAuthAdapter,
} from './oauth.service.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';
process.env.DISCORD_CLIENT_ID = 'discord-client';
process.env.DISCORD_CLIENT_SECRET = 'discord-secret';
process.env.TWITCH_CLIENT_ID = 'twitch-client';
process.env.TWITCH_CLIENT_SECRET = 'twitch-secret';
process.env.TIKTOK_CLIENT_ID = 'tiktok-client';
process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
process.env.MICROSOFT_CLIENT_ID = 'ms-client';
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

function discordFetchMock(profile: { id: string; email?: string; verified?: boolean }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok_test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/users/@me')) {
      return new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not-found', { status: 404 });
  }) as typeof fetch;
}

async function startAndParseState(provider: 'discord' | 'twitch' | 'tiktok', extra?: Record<string, string>) {
  const started = await startOAuth({ provider, ...extra });
  const url = new URL(started.url);
  const state = url.searchParams.get('state') || '';
  assert.ok(state);
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  return { started, state, url };
}

describe('creator OAuth login local closure', () => {
  beforeEach(() => {
    setOAuthAuthAdapterForTests(memoryAdapter());
    setOAuthFetchForTests(discordFetchMock({ id: 'd1', email: 'oauth@example.com', verified: true }));
  });

  it('state, PKCE, and production callback URLs stay on the Nexter origin', async () => {
    const { url } = await startAndParseState('discord');
    assert.match(url.toString(), /discord\.com/);
    assert.equal(
      getOAuthCallbackUrl('discord'),
      'https://nexter-creator-studio-production.up.railway.app/api/v1/auth/oauth/discord/callback'
    );
    assert.equal(url.searchParams.get('redirect_uri'), getOAuthCallbackUrl('discord'));
    const availability = getOAuthPublicAvailability();
    assert.equal(availability.discord, true);
    assert.equal(availability.twitch, true);
    assert.equal(availability.tiktok, true);
    assert.equal(availability.microsoft, true);
    assert.equal('github' in availability, false);
    assert.equal('apple' in availability, false);
  });

  it('invalid callback, expired state, and replay are rejected', async () => {
    const invalid = await handleOAuthCallback({ provider: 'discord' });
    assert.match(invalid.redirectTo, /oauth_error=invalid_callback/);
    assert.doesNotMatch(invalid.redirectTo, /access_token|customToken/);

    const { state } = await startAndParseState('discord');
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

  it('existing linked user logs in without a second welcome bonus', async () => {
    const invite = await createInviteCode({ description: 'oauth-existing', maximumUses: 2 }, 'admin-oauth');
    const { state } = await startAndParseState('discord', { intent: 'register', inviteCode: invite.code });
    const first = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(first.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const legal = currentDraftLegalAcceptanceInput();
    const created = await syncAuthenticatedAppUser({
      uid: done.customToken.replace('custom.', ''),
      email: 'oauth@example.com',
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: legal,
    });
    assert.equal(created.created, true);
    assert.equal(await getCoinBalance(created.user.id), 50);

    const { state: state2 } = await startAndParseState('discord');
    const second = await handleOAuthCallback({ provider: 'discord', state: state2, code: 'ok' });
    const ticket2 = new URL(second.redirectTo).searchParams.get('ticket')!;
    const again = await completeOAuthTicket(ticket2);
    const relogin = await syncAuthenticatedAppUser({
      uid: againUid(again.customToken),
      email: 'oauth@example.com',
      authProvider: 'discord',
    });
    assert.equal(relogin.created, false);
    assert.equal(await getCoinBalance(created.user.id), 50);
    const welcome = (await getTransactions(created.user.id)).filter((tx) =>
      String((tx as { idempotencyKey?: string }).idempotencyKey ?? '').startsWith('welcome:')
    );
    assert.equal(welcome.length, 1);
  });

  it('invite_only blocks new OAuth users without invite and allows invited users once', async () => {
    setOAuthFetchForTests(discordFetchMock({ id: 'd-new', email: 'new-oauth@example.com', verified: true }));
    const { state } = await startAndParseState('discord');
    const blocked = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(blocked.redirectTo, /oauth_error=invite_required/);
    assert.equal(await dsGet('oauth_identities', 'discord:d-new'), null);

    const invite = await createInviteCode({ description: 'oauth-new', maximumUses: 1 }, 'admin-oauth');
    const { state: invitedState } = await startAndParseState('discord', {
      intent: 'register',
      inviteCode: invite.code,
    });
    const cb = await handleOAuthCallback({ provider: 'discord', state: invitedState, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = againUid(done.customToken);
    const created = await syncAuthenticatedAppUser({
      uid,
      email: 'new-oauth@example.com',
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(created.created, true);
    assert.equal(await getCoinBalance(uid), 50);
  });

  it('verified email collision does not auto-merge or mint coins', async () => {
    setOAuthAuthAdapterForTests(
      memoryAdapter({ email: 'taken@example.com', uid: 'existing-uid', emailVerified: true })
    );
    setOAuthFetchForTests(discordFetchMock({ id: 'd-col', email: 'taken@example.com', verified: true }));
    const { state } = await startAndParseState('discord');
    const cb = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(cb.redirectTo, /oauth_error=account_collision/);
  });

  it('account linking binds the provider to the logged-in uid only', async () => {
    const adapter = memoryAdapter();
    setOAuthAuthAdapterForTests(adapter);
    const owner = await adapter.createUser({
      email: 'owner@example.com',
      emailVerified: true,
      displayName: 'Owner',
    });
    setOAuthFetchForTests(discordFetchMock({ id: 'd-link', email: 'other@example.com', verified: false }));
    await assert.rejects(
      () => startOAuth({ provider: 'discord', intent: 'link' }),
      (err: unknown) => err instanceof AppError && err.code === 'AUTH_REQUIRED'
    );
    const started = await startOAuth({ provider: 'discord', intent: 'link', linkUid: owner.uid });
    const state2 = new URL(started.url).searchParams.get('state')!;
    const cb = await handleOAuthCallback({ provider: 'discord', state: state2, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    assert.equal(againUid(done.customToken), owner.uid);
  });

  it('missing secrets disable the provider; GitHub and Apple are not login providers', () => {
    const prevId = process.env.DISCORD_CLIENT_ID;
    const prevSecret = process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    assert.equal(isDiscordOAuthConfigured(), false);
    assert.equal(getOAuthPublicAvailability().discord, false);
    assert.equal('github' in getOAuthPublicAvailability(), false);
    assert.equal('apple' in getOAuthPublicAvailability(), false);
    process.env.DISCORD_CLIENT_ID = prevId;
    process.env.DISCORD_CLIENT_SECRET = prevSecret;
  });

  it('production callbacks reject localhost and the retired UCBS host', () => {
    const src = repo('backend/src/services/oauth.service.ts');
    assert.match(src, /nexter-creator-studio-production|getOAuthPublicOrigin/);
    assert.match(src, /creatorbrandingstudioultimate-production/);
    assert.match(src, /code_challenge/);
    assert.match(src, /code_verifier/);
    assert.doesNotMatch(src, /console\.(log|debug|info)\(.*access_token/);
    assert.doesNotMatch(src, /console\.(log|debug|info)\(.*client_secret/);
    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    assert.match(login, /oauth\?\.discord/);
    assert.match(login, /nicht verfügbar/);
    assert.doesNotMatch(login, /GitHub/);
    assert.doesNotMatch(login, /Apple/);
    assert.doesNotMatch(login, /id: 'github'/);
    assert.doesNotMatch(login, /id: 'apple'/);
    const ctx = repo('frontend/src/context/AuthContext.tsx');
    assert.match(ctx, /isFirebaseHostedOAuth/);
    assert.match(ctx, /isBridgeOAuthProvider/);
    const firebase = repo('frontend/src/lib/firebase.ts');
    assert.doesNotMatch(firebase, /oidc\.discord/);
    assert.match(firebase, /microsoft\.com/);
    const completePage = repo('frontend/src/pages/auth/OAuthCompletePage.tsx');
    assert.match(completePage, /completeOAuthCustomToken/);
    assert.doesNotMatch(completePage, /console\.(log|debug|info)/);
    const routes = repo('backend/src/routes/oauth.routes.ts');
    assert.match(routes, /oauth\/complete/);
    assert.doesNotMatch(routes, /res\.redirect\(.*customToken/);
  });

  it('cancel, network failure, missing secret start, and unverified email collision stay safe', async () => {
    const cancelled = await handleOAuthCallback({ provider: 'discord', error: 'access_denied' });
    assert.match(cancelled.redirectTo, /oauth_error=cancelled/);
    assert.doesNotMatch(cancelled.redirectTo, /ticket=/);

    setOAuthFetchForTests(async () => {
      throw new Error('network down');
    });
    const { state } = await startAndParseState('discord');
    const failed = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(failed.redirectTo, /oauth_error=oauth_failed/);
    assert.doesNotMatch(failed.redirectTo, /access_token|refresh_token|customToken/);

    await assert.rejects(
      () => startOAuth({ provider: 'steam' }),
      (err: unknown) => err instanceof AppError && err.code === 'OAUTH_PROVIDER_UNSUPPORTED'
    );

    const prevId = process.env.DISCORD_CLIENT_ID;
    const prevSecret = process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    await assert.rejects(
      () => startOAuth({ provider: 'discord' }),
      (err: unknown) => err instanceof AppError && err.code === 'OAUTH_NOT_CONFIGURED'
    );
    process.env.DISCORD_CLIENT_ID = prevId;
    process.env.DISCORD_CLIENT_SECRET = prevSecret;

    setOAuthAuthAdapterForTests(
      memoryAdapter({ email: 'unverified-taken@example.com', uid: 'existing-unverified', emailVerified: false })
    );
    setOAuthFetchForTests(
      discordFetchMock({ id: 'd-unv', email: 'unverified-taken@example.com', verified: false })
    );
    const { state: collisionState } = await startAndParseState('discord');
    const collision = await handleOAuthCallback({ provider: 'discord', state: collisionState, code: 'ok' });
    assert.match(collision.redirectTo, /oauth_error=account_collision/);
  });

  it('production origin fail-safe rejects localhost and the retired UCBS host', () => {
    const prevNode = process.env.NODE_ENV;
    const prevFront = process.env.FRONTEND_URL;
    process.env.NODE_ENV = 'production';
    try {
      process.env.FRONTEND_URL = 'http://localhost:5173';
      assert.throws(() => getOAuthCallbackUrl('discord'), (err: unknown) => err instanceof AppError && err.code === 'OAUTH_ORIGIN_INVALID');
      process.env.FRONTEND_URL = 'https://creatorbrandingstudioultimate-production.up.railway.app';
      assert.throws(() => getOAuthCallbackUrl('discord'), (err: unknown) => err instanceof AppError && err.code === 'OAUTH_ORIGIN_INVALID');
      process.env.FRONTEND_URL = 'https://evil.example.com';
      assert.throws(() => getOAuthCallbackUrl('discord'), (err: unknown) => err instanceof AppError && err.code === 'OAUTH_ORIGIN_INVALID');
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      process.env.FRONTEND_URL = prevFront;
    }
  });

  it('ticket replay is rejected and tokens stay out of redirect URLs', async () => {
    const invite = await createInviteCode({ description: 'oauth-ticket', maximumUses: 1 }, 'admin-oauth');
    const { state } = await startAndParseState('discord', { intent: 'register', inviteCode: invite.code });
    const cb = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.doesNotMatch(cb.redirectTo, /access_token|refresh_token|customToken/);
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    await completeOAuthTicket(ticket);
    await assert.rejects(
      () => completeOAuthTicket(ticket),
      (err: unknown) => err instanceof AppError && err.code === 'OAUTH_TICKET_REPLAY'
    );
  });
});

function againUid(customToken: string): string {
  return customToken.replace(/^custom\./, '');
}

void dsGet;
