import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';
import { dsGet, dsSet, dsDelete, dsListWhere } from '../lib/data-store.js';
import { isProduction } from '../config/env.js';
import {
  getDiscordOAuthCredentials,
  getTwitchOAuthCredentials,
  getTikTokOAuthCredentials,
  getOAuthPublicOrigin,
  isOAuthBridgeProvider,
  type BridgeOAuthProvider,
} from '../config/env.js';
import {
  createFirebaseAuthUser,
  createFirebaseCustomToken,
  deleteFirebaseAuthUser,
  lookupFirebaseUserByEmail,
} from '../config/firebase.js';
import { ServiceError } from '../lib/errors.js';
import { getRegistrationMode } from './system-settings.service.js';
import { getUserById } from './user.service.js';
import {
  assertInviteEligible,
  INVITE_REQUIRED_MESSAGE,
} from './invite.service.js';

const STATE_COLLECTION = 'oauth_states';
const TICKET_COLLECTION = 'oauth_tickets';
const IDENTITY_COLLECTION = 'oauth_identities';

const STATE_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;
const FORBIDDEN_CALLBACK_HOSTS = [
  'localhost',
  '127.0.0.1',
  'creatorbrandingstudioultimate-production.up.railway.app',
];
const PRODUCTION_ALLOWED_CALLBACK_HOSTS = ['nexter-creator-studio-production.up.railway.app'] as const;

export const DISCORD_OAUTH_SCOPES = ['identify', 'email'] as const;
export const OAUTH_IDENTITY_COLLECTION = IDENTITY_COLLECTION;

export type OAuthIntent = 'login' | 'register' | 'link';

export interface OAuthAuthAdapter {
  getUserByEmail(email: string): Promise<{ uid: string; emailVerified: boolean } | null>;
  createUser(input: { email?: string; emailVerified: boolean; displayName?: string }): Promise<{ uid: string }>;
  createCustomToken(uid: string): Promise<string>;
  deleteUser(uid: string): Promise<void>;
}

const productionAdapter: OAuthAuthAdapter = {
  getUserByEmail: lookupFirebaseUserByEmail,
  createUser: createFirebaseAuthUser,
  createCustomToken: createFirebaseCustomToken,
  deleteUser: deleteFirebaseAuthUser,
};

let authAdapter: OAuthAuthAdapter = productionAdapter;
let oauthFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export function setOAuthAuthAdapterForTests(adapter: OAuthAuthAdapter | null): void {
  authAdapter = adapter || productionAdapter;
}

export function setOAuthFetchForTests(fn: typeof fetch | null): void {
  oauthFetch = fn || globalThis.fetch.bind(globalThis);
}

interface OAuthStateRow {
  id: string;
  provider: BridgeOAuthProvider;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  intent: OAuthIntent;
  inviteCode?: string;
  termsVersion?: string;
  privacyVersion?: string;
  linkUid?: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

interface OAuthTicketRow {
  id: string;
  firebaseUid: string;
  provider: BridgeOAuthProvider;
  inviteCode?: string;
  termsVersion?: string;
  privacyVersion?: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

interface OAuthIdentityRow {
  id: string;
  provider: BridgeOAuthProvider;
  providerUserId: string;
  firebaseUid: string;
  email?: string;
  emailVerified: boolean;
  createdAt: string;
  registrationPending?: boolean;
}

interface ProviderProfile {
  providerUserId: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

function pkceVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function identityId(provider: BridgeOAuthProvider, providerUserId: string): string {
  return `${provider}:${providerUserId}`;
}

function assertSafePublicOrigin(origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AppError(500, 'OAUTH_ORIGIN_INVALID', 'OAuth-Origin ist ungültig.');
  }
  const host = parsed.hostname.toLowerCase();
  if (host.includes('creatorstudio') && host.includes('519eb')) {
    throw new AppError(500, 'OAUTH_ORIGIN_INVALID', 'OAuth-Origin ist in Production nicht erlaubt.');
  }
  if (isProduction()) {
    if (parsed.protocol !== 'https:') {
      throw new AppError(500, 'OAUTH_ORIGIN_INVALID', 'OAuth-Origin ist in Production nicht erlaubt.');
    }
    if (
      FORBIDDEN_CALLBACK_HOSTS.includes(host) ||
      !(PRODUCTION_ALLOWED_CALLBACK_HOSTS as readonly string[]).includes(host)
    ) {
      throw new AppError(500, 'OAUTH_ORIGIN_INVALID', 'OAuth-Origin ist in Production nicht erlaubt.');
    }
  }
  return origin.replace(/\/+$/, '');
}

export function getOAuthCallbackUrl(provider: BridgeOAuthProvider): string {
  const origin = assertSafePublicOrigin(getOAuthPublicOrigin());
  return `${origin}/api/v1/auth/oauth/${provider}/callback`;
}

export function getOAuthCompleteUrl(ticket: string, error?: string): string {
  const origin = assertSafePublicOrigin(getOAuthPublicOrigin());
  const url = new URL('/login/oauth/complete', `${origin}/`);
  if (error) url.searchParams.set('oauth_error', error);
  else url.searchParams.set('ticket', ticket);
  return url.toString();
}

function credentialsFor(provider: BridgeOAuthProvider): { clientId: string; clientSecret: string } {
  const creds =
    provider === 'discord'
      ? getDiscordOAuthCredentials()
      : provider === 'twitch'
        ? getTwitchOAuthCredentials()
        : getTikTokOAuthCredentials();
  if (!creds) {
    throw new AppError(503, 'OAUTH_NOT_CONFIGURED', 'Dieser Anmeldeanbieter ist derzeit nicht verfügbar.');
  }
  return creds;
}

function authorizeUrl(provider: BridgeOAuthProvider, input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  nonce: string;
}): string {
  if (provider === 'discord') {
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', DISCORD_OAUTH_SCOPES.join(' '));
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }
  if (provider === 'twitch') {
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', 'user:read:email');
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('nonce', input.nonce);
    return url.toString();
  }
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', input.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', 'user.info.basic,user.info.profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

async function exchangeCode(
  provider: BridgeOAuthProvider,
  creds: { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
  verifier: string
): Promise<string> {
  let res: Response;
  if (provider === 'discord') {
    const body = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    res = await oauthFetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } else if (provider === 'twitch') {
    const body = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    res = await oauthFetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } else {
    const body = new URLSearchParams({
      client_key: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    res = await oauthFetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  if (!res.ok) {
    throw new AppError(401, 'OAUTH_TOKEN_EXCHANGE_FAILED', 'OAuth-Anmeldung fehlgeschlagen.');
  }
  const json = (await res.json()) as Record<string, unknown>;
  const nested = json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : json;
  const accessToken = typeof nested.access_token === 'string' ? nested.access_token : '';
  if (!accessToken) {
    throw new AppError(401, 'OAUTH_TOKEN_EXCHANGE_FAILED', 'OAuth-Anmeldung fehlgeschlagen.');
  }
  return accessToken;
}

async function fetchProfile(
  provider: BridgeOAuthProvider,
  creds: { clientId: string; clientSecret: string },
  accessToken: string
): Promise<ProviderProfile> {
  if (provider === 'discord') {
    const res = await oauthFetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new AppError(401, 'OAUTH_PROFILE_FAILED', 'OAuth-Profil konnte nicht geladen werden.');
    const json = (await res.json()) as {
      id?: string;
      email?: string;
      verified?: boolean;
      username?: string;
      global_name?: string;
    };
    if (!json.id) throw new AppError(401, 'OAUTH_PROFILE_FAILED', 'OAuth-Profil konnte nicht geladen werden.');
    return {
      providerUserId: json.id,
      email: json.email?.trim().toLowerCase() || undefined,
      emailVerified: json.verified === true && Boolean(json.email),
      displayName: json.global_name || json.username,
    };
  }
  if (provider === 'twitch') {
    const res = await oauthFetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': creds.clientId,
      },
    });
    if (!res.ok) throw new AppError(401, 'OAUTH_PROFILE_FAILED', 'OAuth-Profil konnte nicht geladen werden.');
    const json = (await res.json()) as {
      data?: Array<{ id?: string; email?: string; display_name?: string }>;
    };
    const user = json.data?.[0];
    if (!user?.id) throw new AppError(401, 'OAUTH_PROFILE_FAILED', 'OAuth-Profil konnte nicht geladen werden.');
    return {
      providerUserId: user.id,
      email: user.email?.trim().toLowerCase() || undefined,
      emailVerified: Boolean(user.email),
      displayName: user.display_name,
    };
  }
  const res = await oauthFetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new AppError(401, 'OAUTH_PROFILE_FAILED', 'OAuth-Profil konnte nicht geladen werden.');
  const json = (await res.json()) as {
    data?: { user?: { open_id?: string; display_name?: string } };
  };
  const user = json.data?.user;
  if (!user?.open_id) throw new AppError(401, 'OAUTH_PROFILE_FAILED', 'OAuth-Profil konnte nicht geladen werden.');
  return {
    providerUserId: user.open_id,
    email: undefined,
    emailVerified: false,
    displayName: user.display_name,
  };
}

function writeIdentity(row: OAuthIdentityRow): Promise<void> {
  return dsSet(IDENTITY_COLLECTION, row.id, row as unknown as Record<string, unknown>);
}

async function assertNewOAuthRegistrationAllowed(
  inviteCode: string | undefined,
  profile: ProviderProfile
): Promise<void> {
  const mode = await getRegistrationMode();
  if (mode === 'closed') {
    throw new AppError(403, 'ACCESS_DENIED', 'Registrierung ist derzeit geschlossen');
  }
  if (mode === 'public') return;
  if (!inviteCode?.trim()) {
    throw new AppError(403, 'INVITE_REQUIRED', INVITE_REQUIRED_MESSAGE);
  }
  await assertInviteEligible(inviteCode, {
    email: profile.email,
    emailVerified: profile.emailVerified,
  });
}

async function resolveFirebaseUid(
  provider: BridgeOAuthProvider,
  profile: ProviderProfile,
  intent: OAuthIntent,
  linkUid: string | undefined,
  inviteCode: string | undefined
): Promise<{ firebaseUid: string; created: boolean }> {
  const id = identityId(provider, profile.providerUserId);
  const existing = (await dsGet(IDENTITY_COLLECTION, id)) as OAuthIdentityRow | null;

  if (intent === 'link') {
    if (!linkUid) {
      throw new AppError(401, 'AUTH_REQUIRED', 'Bitte zuerst anmelden, um ein Konto zu verknüpfen.');
    }
    if (existing && existing.firebaseUid !== linkUid) {
      throw new AppError(409, 'OAUTH_LINK_CONFLICT', 'Dieser Anbieter ist bereits mit einem anderen Konto verknüpft.');
    }
    if (!existing) {
      await writeIdentity({
        id,
        provider,
        providerUserId: profile.providerUserId,
        firebaseUid: linkUid,
        email: profile.email,
        emailVerified: profile.emailVerified,
        createdAt: nowIso(),
      });
    }
    return { firebaseUid: linkUid, created: false };
  }

  if (existing) {
    const appUser = await getUserById(existing.firebaseUid);
    if (!appUser) {
      await assertNewOAuthRegistrationAllowed(inviteCode, profile);
    }
    return { firebaseUid: existing.firebaseUid, created: false };
  }

  if (profile.email) {
    const byEmail = await authAdapter.getUserByEmail(profile.email);
    if (byEmail) {
      throw new AppError(
        409,
        'ACCOUNT_COLLISION',
        'Zu dieser E-Mail existiert bereits ein Konto. Bitte zuerst damit anmelden und den Anbieter in den Einstellungen verknüpfen.'
      );
    }
  }

  await assertNewOAuthRegistrationAllowed(inviteCode, profile);

  let created: { uid: string };
  try {
    created = await authAdapter.createUser({
      email: profile.email,
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/email-already-exists' ||
      (err instanceof AppError && err.code === 'ACCOUNT_COLLISION')
    ) {
      throw new AppError(
        409,
        'ACCOUNT_COLLISION',
        'Zu dieser E-Mail existiert bereits ein Konto. Bitte zuerst damit anmelden und den Anbieter in den Einstellungen verknüpfen.'
      );
    }
    throw err;
  }

  try {
    await writeIdentity({
      id,
      provider,
      providerUserId: profile.providerUserId,
      firebaseUid: created.uid,
      email: profile.email,
      emailVerified: profile.emailVerified,
      createdAt: nowIso(),
      registrationPending: true,
    });
  } catch (err) {
    await authAdapter.deleteUser(created.uid).catch(() => undefined);
    throw err;
  }
  return { firebaseUid: created.uid, created: true };
}

export async function markOAuthRegistrationComplete(firebaseUid: string): Promise<void> {
  const rows = await listOAuthIdentitiesForUser(firebaseUid);
  for (const row of rows) {
    const raw = (await dsGet(IDENTITY_COLLECTION, row.id)) as OAuthIdentityRow | null;
    if (!raw?.registrationPending) continue;
    await writeIdentity({ ...raw, registrationPending: false });
  }
}

export async function compensatePendingOAuthRegistration(firebaseUid: string): Promise<boolean> {
  if (!firebaseUid) return false;
  const appUser = await getUserById(firebaseUid);
  if (appUser) return false;
  const rows = await listOAuthIdentitiesForUser(firebaseUid);
  const pending = [];
  for (const row of rows) {
    const raw = (await dsGet(IDENTITY_COLLECTION, row.id)) as OAuthIdentityRow | null;
    if (raw?.registrationPending && raw.firebaseUid === firebaseUid) pending.push(raw);
  }
  if (!pending.length) return false;
  for (const row of pending) {
    await dsDelete(IDENTITY_COLLECTION, row.id);
  }
  await authAdapter.deleteUser(firebaseUid).catch(() => undefined);
  return true;
}

export async function startOAuth(input: {
  provider: string;
  intent?: string;
  inviteCode?: string;
  termsVersion?: string;
  privacyVersion?: string;
  linkUid?: string;
}): Promise<{ url: string }> {
  if (!isOAuthBridgeProvider(input.provider)) {
    throw new AppError(400, 'OAUTH_PROVIDER_UNSUPPORTED', 'Dieser Anmeldeanbieter ist nicht verfügbar.');
  }
  const provider = input.provider;
  const creds = credentialsFor(provider);
  const intent: OAuthIntent =
    input.intent === 'link' ? 'link' : input.intent === 'register' ? 'register' : 'login';
  if (intent === 'link' && !input.linkUid) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Bitte zuerst anmelden, um ein Konto zu verknüpfen.');
  }

  const redirectUri = getOAuthCallbackUrl(provider);
  const state = randomToken(24);
  const codeVerifier = pkceVerifier();
  const nonce = randomToken(16);
  const createdAt = nowIso();
  const row: OAuthStateRow = {
    id: state,
    provider,
    codeVerifier,
    nonce,
    redirectUri,
    intent,
    inviteCode: input.inviteCode?.trim() || undefined,
    termsVersion: input.termsVersion,
    privacyVersion: input.privacyVersion,
    linkUid: intent === 'link' ? input.linkUid : undefined,
    createdAt,
    expiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  };
  await dsSet(STATE_COLLECTION, state, row as unknown as Record<string, unknown>);

  return {
    url: authorizeUrl(provider, {
      clientId: creds.clientId,
      redirectUri,
      state,
      challenge: pkceChallenge(codeVerifier),
      nonce,
    }),
  };
}

export async function handleOAuthCallback(input: {
  provider: string;
  code?: string;
  state?: string;
  error?: string;
}): Promise<{ redirectTo: string }> {
  if (!isOAuthBridgeProvider(input.provider)) {
    throw new AppError(400, 'OAUTH_PROVIDER_UNSUPPORTED', 'Dieser Anmeldeanbieter ist nicht verfügbar.');
  }
  const provider = input.provider;
  if (input.error === 'access_denied' || input.error === 'cancelled') {
    return { redirectTo: getOAuthCompleteUrl('', 'cancelled') };
  }
  if (input.error) {
    return { redirectTo: getOAuthCompleteUrl('', 'oauth_failed') };
  }
  if (!input.state || !input.code) {
    return { redirectTo: getOAuthCompleteUrl('', 'invalid_callback') };
  }

  const row = (await dsGet(STATE_COLLECTION, input.state)) as OAuthStateRow | null;
  if (!row || row.provider !== provider) {
    return { redirectTo: getOAuthCompleteUrl('', 'invalid_state') };
  }
  if (row.usedAt) {
    return { redirectTo: getOAuthCompleteUrl('', 'replay') };
  }
  if (Date.parse(row.expiresAt) < Date.now()) {
    return { redirectTo: getOAuthCompleteUrl('', 'expired') };
  }

  row.usedAt = nowIso();
  await dsSet(STATE_COLLECTION, row.id, row as unknown as Record<string, unknown>);

  const expectedRedirect = getOAuthCallbackUrl(provider);
  if (row.redirectUri !== expectedRedirect) {
    return { redirectTo: getOAuthCompleteUrl('', 'invalid_callback') };
  }

  try {
    const creds = credentialsFor(provider);
    const accessToken = await exchangeCode(provider, creds, input.code, row.redirectUri, row.codeVerifier);
    const profile = await fetchProfile(provider, creds, accessToken);
    let created = false;
    let firebaseUid = '';
    try {
      const resolved = await resolveFirebaseUid(provider, profile, row.intent, row.linkUid, row.inviteCode);
      firebaseUid = resolved.firebaseUid;
      created = resolved.created;
      const ticket = randomToken(24);
      const ticketRow: OAuthTicketRow = {
        id: ticket,
        firebaseUid,
        provider,
        inviteCode: row.inviteCode,
        termsVersion: row.termsVersion,
        privacyVersion: row.privacyVersion,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + TICKET_TTL_MS).toISOString(),
      };
      await dsSet(TICKET_COLLECTION, ticket, ticketRow as unknown as Record<string, unknown>);
      return { redirectTo: getOAuthCompleteUrl(ticket) };
    } catch (inner) {
      if (created && firebaseUid) {
        await compensatePendingOAuthRegistration(firebaseUid).catch(() => undefined);
      }
      throw inner;
    }
  } catch (err) {
    return { redirectTo: getOAuthCompleteUrl('', oauthCallbackError(err)) };
  }
}

function oauthCallbackError(err: unknown): string {
  const code = err instanceof AppError || err instanceof ServiceError ? err.code : '';
  if (code === 'ACCOUNT_COLLISION') return 'account_collision';
  if (code === 'OAUTH_LINK_CONFLICT') return 'link_conflict';
  if (code === 'OAUTH_TOKEN_EXCHANGE_FAILED') return 'invalid_code';
  if (code === 'OAUTH_PROFILE_FAILED') return 'oauth_failed';
  if (code === 'OAUTH_NOT_CONFIGURED') return 'not_configured';
  if (code === 'INVITE_REQUIRED') return 'invite_required';
  if (code === 'INVITE_INVALID') return 'invite_invalid';
  if (code === 'INVITE_EXPIRED') return 'invite_expired';
  if (code === 'INVITE_EXHAUSTED') return 'invite_exhausted';
  if (code === 'INVITE_EMAIL_REQUIRED') return 'invite_email_required';
  if (code === 'INVITE_EMAIL_MISMATCH') return 'invite_email_mismatch';
  if (code === 'ACCESS_DENIED' && err instanceof Error && /geschlossen/i.test(err.message)) {
    return 'registration_closed';
  }
  if (code === 'ACCESS_DENIED') return 'invite_required';
  return 'oauth_failed';
}

export async function listOAuthIdentitiesForUser(firebaseUid: string): Promise<
  Array<{
    id: string;
    provider: string;
    providerUserId: string;
    emailVerified: boolean;
    createdAt?: string;
  }>
> {
  const rows = await dsListWhere(IDENTITY_COLLECTION, { firebaseUid });
  return rows.map((row) => ({
    id: String(row.id),
    provider: String(row.provider ?? ''),
    providerUserId: String(row.providerUserId ?? ''),
    emailVerified: row.emailVerified === true,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  }));
}

export async function deleteOAuthIdentitiesForUser(firebaseUid: string): Promise<void> {
  const rows = await listOAuthIdentitiesForUser(firebaseUid);
  for (const row of rows) {
    await dsDelete(IDENTITY_COLLECTION, row.id);
  }
}

export async function completeOAuthTicket(ticket: string): Promise<{
  customToken: string;
  provider: BridgeOAuthProvider;
  inviteCode?: string;
  termsVersion?: string;
  privacyVersion?: string;
}> {
  const row = (await dsGet(TICKET_COLLECTION, ticket.trim())) as OAuthTicketRow | null;
  if (!row) {
    throw new AppError(400, 'OAUTH_TICKET_INVALID', 'Die Anmeldung ist abgelaufen. Bitte erneut versuchen.');
  }
  if (row.usedAt) {
    throw new AppError(400, 'OAUTH_TICKET_REPLAY', 'Diese Anmeldung wurde bereits verwendet.');
  }
  if (Date.parse(row.expiresAt) < Date.now()) {
    throw new AppError(400, 'OAUTH_TICKET_EXPIRED', 'Die Anmeldung ist abgelaufen. Bitte erneut versuchen.');
  }
  row.usedAt = nowIso();
  await dsSet(TICKET_COLLECTION, row.id, row as unknown as Record<string, unknown>);
  const customToken = await authAdapter.createCustomToken(row.firebaseUid);
  return {
    customToken,
    provider: row.provider,
    inviteCode: row.inviteCode,
    termsVersion: row.termsVersion,
    privacyVersion: row.privacyVersion,
  };
}

export function assertNoSecretLeakage(text: string): void {
  if (/access_token|refresh_token|client_secret|customToken/i.test(text) && /console\.(log|debug|info)/i.test(text)) {
    throw new Error('secret leakage');
  }
}
