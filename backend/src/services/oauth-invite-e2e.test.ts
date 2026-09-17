import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentDraftLegalAcceptanceInput } from '@ucbs/shared';
import { dsGet } from '../lib/data-store.js';
import { getDefaultFreeCoins } from '../config/env.js';
import { createInviteCode, getInviteByCode, redeemInviteCode } from './invite.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { getOrCreateUser, getUserById } from './user.service.js';
import {
  completeOAuthTicket,
  compensatePendingOAuthRegistration,
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
process.env.TWITCH_CLIENT_ID = 'twitch-client';
process.env.TWITCH_CLIENT_SECRET = 'twitch-secret';
process.env.TIKTOK_CLIENT_ID = 'tiktok-client';
process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
process.env.FRONTEND_URL = 'https://nexter-creator-studio-production.up.railway.app';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function uidFromToken(token: string): string {
  return token.replace(/^custom\./, '');
}

function trackingAdapter(seed?: { email: string; uid: string; emailVerified?: boolean }): OAuthAuthAdapter & {
  created: string[];
  deleted: string[];
  has(uid: string): boolean;
} {
  const users = new Map<string, { uid: string; email?: string; emailVerified: boolean }>();
  const byEmail = new Map<string, string>();
  const created: string[] = [];
  const deleted: string[] = [];
  if (seed) {
    users.set(seed.uid, { uid: seed.uid, email: seed.email, emailVerified: seed.emailVerified === true });
    byEmail.set(seed.email.toLowerCase(), seed.uid);
  }
  return {
    created,
    deleted,
    has: (uid) => users.has(uid),
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
      created.push(uid);
      return { uid };
    },
    async createCustomToken(uid) {
      return `custom.${uid}`;
    },
    async deleteUser(uid) {
      const row = users.get(uid);
      if (row?.email) byEmail.delete(row.email.toLowerCase());
      users.delete(uid);
      deleted.push(uid);
    },
  };
}

function providerFetch(kind: 'discord' | 'twitch' | 'tiktok', profile: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/oauth2/token') || url.includes('/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'tok_test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (kind === 'discord' && url.includes('/users/@me')) {
      return new Response(JSON.stringify(profile), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (kind === 'twitch' && url.includes('/helix/users')) {
      return new Response(JSON.stringify({ data: [profile] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (kind === 'tiktok' && url.includes('/user/info')) {
      return new Response(JSON.stringify({ data: { user: profile } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not-found', { status: 404 });
  }) as typeof fetch;
}

async function startProvider(provider: 'discord' | 'twitch' | 'tiktok', extra?: Record<string, string>) {
  const started = await startOAuth({ provider, ...extra });
  const url = new URL(started.url);
  return { url, state: url.searchParams.get('state') || '' };
}

async function invitedStart(provider: 'discord' | 'twitch' | 'tiktok', extra?: Record<string, string>) {
  const invite = await createInviteCode({ description: `${provider}-${randomUUID()}`, maximumUses: 1 }, 'admin-block-e');
  const started = await startProvider(provider, { intent: 'register', inviteCode: invite.code, ...extra });
  return { ...started, invite };
}

describe('Block E — OAuth invite orphans + TikTok email', () => {
  let adapter: ReturnType<typeof trackingAdapter>;
  let discordId: string;
  let discordEmail: string;

  beforeEach(() => {
    adapter = trackingAdapter();
    discordId = `d-${randomUUID()}`;
    discordEmail = `e2e-${discordId}@example.com`;
    setOAuthAuthAdapterForTests(adapter);
    setOAuthFetchForTests(providerFetch('discord', { id: discordId, email: discordEmail, verified: true }));
  });

  it('1-3 new OAuth user without/invalid/expired invite is blocked with no app user or bonus', async () => {
    const { state } = await startProvider('discord');
    const none = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(none.redirectTo, /oauth_error=invite_required/);
    assert.equal(adapter.created.length, 0);
    assert.equal(await getUserById('missing'), null);

    const { state: invalidState } = await startProvider('discord', {
      intent: 'register',
      inviteCode: 'NOT-REAL',
    });
    const invalid = await handleOAuthCallback({ provider: 'discord', state: invalidState, code: 'ok' });
    assert.match(invalid.redirectTo, /oauth_error=invite_invalid/);
    assert.equal(adapter.created.length, 0);

    const expired = await createInviteCode(
      { description: 'expired', maximumUses: 1, expiresAt: new Date(Date.now() - 1000).toISOString() },
      'admin-block-e'
    );
    const { state: expiredState } = await startProvider('discord', {
      intent: 'register',
      inviteCode: expired.code,
    });
    const expiredCb = await handleOAuthCallback({ provider: 'discord', state: expiredState, code: 'ok' });
    assert.match(expiredCb.redirectTo, /oauth_error=invite_expired/);
    assert.equal((await getInviteByCode(expired.code))?.currentUses, 0);
    assert.equal(adapter.created.length, 0);
  });

  it('4-5 general invite and assigned-email matching verified email succeed once', async () => {
    const { state, invite } = await invitedStart('discord');
    const cb = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    const created = await syncAuthenticatedAppUser({
      uid,
      email: discordEmail,
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(created.created, true);
    assert.equal(await getCoinBalance(uid), 50);
    assert.equal((await getInviteByCode(invite.code))?.currentUses, 1);
    const welcome = (await getTransactions(uid)).filter((tx) =>
      String((tx as { idempotencyKey?: string }).idempotencyKey ?? '').startsWith('welcome:')
    );
    assert.equal(welcome.length, 1);

    setOAuthFetchForTests(
      providerFetch('discord', { id: `d-assigned-${randomUUID()}`, email: 'assigned@example.com', verified: true })
    );
    const assigned = await createInviteCode(
      { description: 'assigned', assignedEmail: 'assigned@example.com', maximumUses: 1 },
      'admin-block-e'
    );
    const started = await startProvider('discord', { intent: 'register', inviteCode: assigned.code });
    const assignedCb = await handleOAuthCallback({ provider: 'discord', state: started.state, code: 'ok' });
    const assignedTicket = new URL(assignedCb.redirectTo).searchParams.get('ticket')!;
    const assignedDone = await completeOAuthTicket(assignedTicket);
    const assignedUid = uidFromToken(assignedDone.customToken);
    const assignedUser = await syncAuthenticatedAppUser({
      uid: assignedUid,
      email: 'assigned@example.com',
      inviteCode: assigned.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(assignedUser.created, true);
    assert.equal(await getCoinBalance(assignedUid), 50);
  });

  it('6-7 assigned-email mismatch and missing provider email are blocked', async () => {
    const assigned = await createInviteCode(
      { description: 'mismatch', assignedEmail: 'owner@example.com', maximumUses: 1 },
      'admin-block-e'
    );
    const started = await startProvider('discord', { intent: 'register', inviteCode: assigned.code });
    const mismatch = await handleOAuthCallback({ provider: 'discord', state: started.state, code: 'ok' });
    assert.match(mismatch.redirectTo, /oauth_error=invite_email_mismatch/);
    assert.equal((await getInviteByCode(assigned.code))?.currentUses, 0);
    assert.equal(adapter.created.length, 0);

    setOAuthFetchForTests(providerFetch('tiktok', { open_id: 'tt-no-mail', display_name: 'NoMail' }));
    const tiktokAssigned = await createInviteCode(
      { description: 'tt-assigned', assignedEmail: 'user@example.com', maximumUses: 1 },
      'admin-block-e'
    );
    const ttStart = await startProvider('tiktok', { intent: 'register', inviteCode: tiktokAssigned.code });
    const ttCb = await handleOAuthCallback({ provider: 'tiktok', state: ttStart.state, code: 'ok' });
    assert.match(ttCb.redirectTo, /oauth_error=invite_email_required/);
    assert.doesNotMatch(ttCb.redirectTo, /INVITE_EMAIL_REQUIRED|TIKTOK_EMAIL_MISSING/);
    assert.equal((await getInviteByCode(tiktokAssigned.code))?.currentUses, 0);
    assert.equal(adapter.created.length, 0);
  });

  it('8-9 TikTok general invite without email is supported; assigned-email stays blocked', async () => {
    setOAuthFetchForTests(providerFetch('tiktok', { open_id: 'tt-general', display_name: 'Loop' }));
    const { state, invite } = await invitedStart('tiktok');
    const cb = await handleOAuthCallback({ provider: 'tiktok', state, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    const created = await syncAuthenticatedAppUser({
      uid,
      inviteCode: invite.code,
      authProvider: 'tiktok',
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(created.created, true);
    assert.equal(created.user.email, '');
    assert.equal(await getCoinBalance(uid), 50);
    const identity = await dsGet('oauth_identities', 'tiktok:tt-general');
    assert.equal(identity?.firebaseUid, uid);
    assert.equal(Object.prototype.hasOwnProperty.call(identity, 'email'), false);
    assert.doesNotMatch(JSON.stringify(identity), /@tiktok\.local|noreply\.nexter/);
  });

  it('10-11 existing linked login and settings linking skip invite and bonus', async () => {
    const { state, invite } = await invitedStart('discord');
    const cb = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    await syncAuthenticatedAppUser({
      uid,
      email: discordEmail,
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    const createdCount = adapter.created.length;
    const { state: again } = await startProvider('discord');
    const login = await handleOAuthCallback({ provider: 'discord', state: again, code: 'ok' });
    const loginTicket = new URL(login.redirectTo).searchParams.get('ticket')!;
    const loginDone = await completeOAuthTicket(loginTicket);
    const relogin = await syncAuthenticatedAppUser({
      uid: uidFromToken(loginDone.customToken),
      email: discordEmail,
      authProvider: 'discord',
    });
    assert.equal(relogin.created, false);
    assert.equal(adapter.created.length, createdCount);
    assert.equal(await getCoinBalance(uid), 50);

    setOAuthFetchForTests(providerFetch('tiktok', { open_id: 'tt-link', display_name: 'LinkMe' }));
    const linkStart = await startOAuth({ provider: 'tiktok', intent: 'link', linkUid: uid });
    const linkState = new URL(linkStart.url).searchParams.get('state')!;
    const linked = await handleOAuthCallback({ provider: 'tiktok', state: linkState, code: 'ok' });
    const linkTicket = new URL(linked.redirectTo).searchParams.get('ticket')!;
    const linkDone = await completeOAuthTicket(linkTicket);
    assert.equal(uidFromToken(linkDone.customToken), uid);
    const afterLink = await syncAuthenticatedAppUser({
      uid,
      email: discordEmail,
      authProvider: 'tiktok',
    });
    assert.equal(afterLink.created, false);
    assert.equal(await getCoinBalance(uid), 50);
    assert.equal((await listOAuthIdentitiesForUser(uid)).length, 2);
  });

  it('12-13 provider identity collision and unverified email do not auto-merge', async () => {
    const owner = await getOrCreateUser(`owner-${randomUUID()}`, 'owner@example.com', 'Owner', {
      authProvider: 'google',
    });
    setOAuthFetchForTests(providerFetch('discord', { id: 'd-taken', email: 'x@example.com', verified: true }));
    const { state, invite } = await invitedStart('discord');
    const first = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(first.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    await syncAuthenticatedAppUser({
      uid: uidFromToken(done.customToken),
      email: 'x@example.com',
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    const other = await getOrCreateUser(owner.id, owner.email, owner.displayName, { authProvider: 'google' });
    const conflictStart = await startOAuth({ provider: 'discord', intent: 'link', linkUid: other.id });
    const conflictState = new URL(conflictStart.url).searchParams.get('state')!;
    const conflict = await handleOAuthCallback({ provider: 'discord', state: conflictState, code: 'ok' });
    assert.match(conflict.redirectTo, /oauth_error=link_conflict/);

    const seeded = trackingAdapter({ email: 'unv@example.com', uid: 'existing-unv', emailVerified: false });
    setOAuthAuthAdapterForTests(seeded);
    setOAuthFetchForTests(providerFetch('discord', { id: 'd-unv', email: 'unv@example.com', verified: false }));
    const unvInvite = await createInviteCode({ description: 'unv', maximumUses: 1 }, 'admin-block-e');
    const unvStart = await startProvider('discord', { intent: 'register', inviteCode: unvInvite.code });
    const unvCb = await handleOAuthCallback({ provider: 'discord', state: unvStart.state, code: 'ok' });
    assert.match(unvCb.redirectTo, /oauth_error=account_collision/);
    assert.equal(seeded.created.length, 0);
    assert.equal(seeded.has('existing-unv'), true);
    assert.equal(seeded.deleted.includes('existing-unv'), false);
  });

  it('14-16 duplicate callback, sync retry, and maxUses=1 concurrency stay unique', async () => {
    const { state, invite } = await invitedStart('discord');
    const first = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const replay = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(first.redirectTo, /ticket=/);
    assert.match(replay.redirectTo, /oauth_error=replay/);
    const ticket = new URL(first.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    const once = await syncAuthenticatedAppUser({
      uid,
      email: discordEmail,
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    const twice = await syncAuthenticatedAppUser({
      uid,
      email: discordEmail,
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(once.created, true);
    assert.equal(twice.created, false);
    assert.equal(await getCoinBalance(uid), 50);
    assert.equal((await getInviteByCode(invite.code))?.currentUses, 1);

    const raceInvite = await createInviteCode({ description: 'race', maximumUses: 1 }, 'admin-block-e');
    const a = `race-a-${randomUUID()}`;
    const b = `race-b-${randomUUID()}`;
    const settled = await Promise.allSettled([
      syncAuthenticatedAppUser({
        uid: a,
        email: `${a}@race.test`,
        inviteCode: raceInvite.code,
        authProvider: 'email',
        emailVerified: true,
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      }),
      syncAuthenticatedAppUser({
        uid: b,
        email: `${b}@race.test`,
        inviteCode: raceInvite.code,
        authProvider: 'email',
        emailVerified: true,
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      }),
    ]);
    assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1);
    assert.equal((await getInviteByCode(raceInvite.code))?.currentUses, 1);
  });

  it('17-19 invite redeem retry is idempotent; pending orphan is cleaned; existing Auth user is never deleted', async () => {
    const { state, invite } = await invitedStart('discord');
    const cb = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    const ticket = new URL(cb.redirectTo).searchParams.get('ticket')!;
    const done = await completeOAuthTicket(ticket);
    const uid = uidFromToken(done.customToken);
    const created = await syncAuthenticatedAppUser({
      uid,
      email: discordEmail,
      inviteCode: invite.code,
      authProvider: 'discord',
      emailVerified: true,
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(created.created, true);
    const again = await redeemInviteCode(invite.code, discordEmail, uid, { emailVerified: true });
    assert.equal(again.invite.currentUses, 1);
    assert.equal((await getInviteByCode(invite.code))?.currentUses, 1);
    assert.equal(await getCoinBalance(uid), 50);

    setOAuthFetchForTests(
      providerFetch('discord', { id: `d-pending-${randomUUID()}`, email: `pend-${randomUUID()}@example.com`, verified: true })
    );
    const pendingStart = await invitedStart('discord');
    const pendingCb = await handleOAuthCallback({ provider: 'discord', state: pendingStart.state, code: 'ok' });
    assert.match(pendingCb.redirectTo, /ticket=/);
    const pendingUid = adapter.created[adapter.created.length - 1];
    assert.ok(pendingUid);
    const cleaned = await compensatePendingOAuthRegistration(pendingUid);
    assert.equal(cleaned, true);
    assert.equal(adapter.deleted.includes(pendingUid), true);
    assert.equal(await getUserById(pendingUid), null);

    const existingUid = `keep-${randomUUID()}`;
    await getOrCreateUser(existingUid, 'keep@example.com', 'Keep');
    const notDeleted = await compensatePendingOAuthRegistration(existingUid);
    assert.equal(notDeleted, false);
    assert.ok(await getUserById(existingUid));
    assert.equal(adapter.deleted.includes(existingUid), false);
  });

  it('20-24 state replay, expired state, open redirect, GitHub/Apple absent, Twitch missing email', async () => {
    const { state } = await startProvider('discord');
    const first = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(first.redirectTo, /oauth_error=invite_required/);
    const replay = await handleOAuthCallback({ provider: 'discord', state, code: 'ok' });
    assert.match(replay.redirectTo, /oauth_error=replay/);

    const expiredId = `expired-${randomUUID()}`;
    const { dsSet } = await import('../lib/data-store.js');
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

    const oauthSrc = repo('backend/src/services/oauth.service.ts');
    assert.doesNotMatch(oauthSrc, /returnTo/);
    assert.doesNotMatch(oauthSrc, /syntheticEmail|noreply\.nexter\.invalid/);
    assert.match(oauthSrc, /code_challenge_method/);
    assert.match(oauthSrc, /PRODUCTION_ALLOWED_CALLBACK_HOSTS/);
    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    assert.doesNotMatch(login, /GitHub/);
    assert.doesNotMatch(login, /Apple/);
    const authMw = repo('backend/src/middleware/auth.ts');
    assert.doesNotMatch(authMw, /unknown\.local/);

    setOAuthFetchForTests(providerFetch('twitch', { id: 'tw-no-mail', display_name: 'TwitchNoMail' }));
    const assigned = await createInviteCode(
      { description: 'twitch-assigned', assignedEmail: 'twitch@example.com', maximumUses: 1 },
      'admin-block-e'
    );
    const twStart = await startProvider('twitch', { intent: 'register', inviteCode: assigned.code });
    const twCb = await handleOAuthCallback({ provider: 'twitch', state: twStart.state, code: 'ok' });
    assert.match(twCb.redirectTo, /oauth_error=invite_email_required/);
    assert.equal((await getInviteByCode(assigned.code))?.currentUses, 0);

    assert.equal(getDefaultFreeCoins(), 50);
    const complete = repo('frontend/src/pages/auth/OAuthCompletePage.tsx');
    assert.match(complete, /invite_email_required/);
    assert.doesNotMatch(complete, /TIKTOK_EMAIL_MISSING/);
  });
});
