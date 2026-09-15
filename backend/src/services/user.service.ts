import {
  UserRole,
  SubscriptionTier,
  resolveNexterPreferences,
  defaultNexterPreferences,
  isNexterLanguage,
  type NexterPreferences,
  type LegalAcceptanceRecord,
} from '@ucbs/shared';
import { getDefaultFreeCoins } from '../config/env.js';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getFirestore } from '../config/firebase.js';
import { omitUndefinedFields } from '../lib/firestore-payload.js';
import { ServiceError } from '../lib/errors.js';
import { userLockKey, withDevLock } from '../lib/dev-mutex.js';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  authProviders: string[];
  coinBalance: number;
  /** Euro balance mirror (cents) — source of truth is balance_ledger */
  balanceCents?: number;
  subscriptionTier: SubscriptionTier;
  locale: string;
  onboardingCompleted: boolean;
  nexterPreferences: NexterPreferences;
  inviteCodeId?: string;
  disabled?: boolean;
  legalAcceptance?: LegalAcceptanceRecord;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_COINS = getDefaultFreeCoins();
export const DISPLAY_NAME_MAX = 100;
const PROFILE_PATCHABLE = new Set(['displayName', 'locale']);

export function sanitizeDisplayName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new ServiceError(400, 'INVALID_DISPLAY_NAME', 'Anzeigename erforderlich');
  }
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) {
    throw new ServiceError(400, 'INVALID_DISPLAY_NAME', 'Anzeigename darf nicht leer sein');
  }
  if (cleaned.length > DISPLAY_NAME_MAX) {
    throw new ServiceError(400, 'INVALID_DISPLAY_NAME', 'Anzeigename zu lang');
  }
  return cleaned;
}

function cleanDisplayNameOrFallback(name: string | undefined, email: string): string {
  const cleaned = (name ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, DISPLAY_NAME_MAX);
  return cleaned || email.split('@')[0] || 'Creator';
}

/**
 * Existing documents without coinBalance must not receive a silent welcome grant.
 * Missing field → 0, never DEFAULT_FREE_COINS.
 */
function normalizeCoinBalance(raw: Record<string, unknown>): number {
  const fromBalance = raw.coinBalance;
  if (typeof fromBalance === 'number' && Number.isFinite(fromBalance)) {
    return Math.max(0, Math.floor(fromBalance));
  }

  const legacyCoins = raw.coins;
  if (typeof legacyCoins === 'number' && Number.isFinite(legacyCoins)) {
    return Math.max(0, Math.floor(legacyCoins));
  }

  return 0;
}

function normalizeRole(raw: unknown): UserRole {
  if (raw === UserRole.CREATOR || raw === 'creator') return UserRole.USER;
  if (typeof raw === 'string' && Object.values(UserRole).includes(raw as UserRole)) {
    return raw as UserRole;
  }
  return UserRole.USER;
}

function normalizeUserProfile(uid: string, data: Record<string, unknown>): UserProfile {
  const coinBalance = normalizeCoinBalance(data);
  const locale = typeof data.locale === 'string' && data.locale.trim() ? data.locale : 'de';
  const displayName = typeof data.displayName === 'string' ? data.displayName : '';
  return {
    id: uid,
    ...data,
    role: normalizeRole(data.role),
    coinBalance,
    locale,
    nexterPreferences: resolveNexterPreferences(data.nexterPreferences, { locale, displayName }),
  } as UserProfile;
}

function createDefaultUser(
  uid: string,
  email: string,
  displayName?: string,
  role: UserRole = UserRole.USER
): UserProfile {
  const now = new Date().toISOString();
  const name = cleanDisplayNameOrFallback(displayName, email);
  return {
    id: uid,
    email,
    displayName: name,
    role,
    authProviders: [],
    coinBalance: DEFAULT_COINS,
    balanceCents: 0,
    subscriptionTier: SubscriptionTier.FREE,
    locale: 'de',
    onboardingCompleted: false,
    nexterPreferences: defaultNexterPreferences({ locale: 'de', displayName: name, now }),
    createdAt: now,
    updatedAt: now,
  };
}

export interface CreateUserOptions {
  authProvider?: string;
  role?: UserRole;
  inviteCodeId?: string;
  legalAcceptance?: LegalAcceptanceRecord;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  authProviderOrOptions?: string | CreateUserOptions
): Promise<UserProfile> {
  const options: CreateUserOptions =
    typeof authProviderOrOptions === 'string'
      ? { authProvider: authProviderOrOptions }
      : authProviderOrOptions || {};

  if (isDevMode()) {
    return withDevLock(userLockKey(uid), async () => createOrLoadUserDev(uid, email, displayName, options));
  }

  return createOrLoadUserFirestore(uid, email, displayName, options);
}

async function createOrLoadUserDev(
  uid: string,
  email: string,
  displayName: string | undefined,
  options: CreateUserOptions
): Promise<UserProfile> {
  const existing = devStore.getUser(uid);
  if (existing) {
    return normalizeUserProfile(uid, existing);
  }
  const user = createDefaultUser(uid, email, displayName, options.role || UserRole.USER);
  if (options.authProvider) {
    user.authProviders = [options.authProvider];
  }
  if (options.inviteCodeId) {
    user.inviteCodeId = options.inviteCodeId;
  }
  if (options.legalAcceptance) {
    user.legalAcceptance = options.legalAcceptance;
  }
  devStore.saveUser(uid, user as unknown as Record<string, unknown>);

  if (DEFAULT_COINS > 0) {
    const { writeWelcomeLedgerOnly } = await import('./coins.service.js');
    await writeWelcomeLedgerOnly({
      userId: uid,
      amount: DEFAULT_COINS,
      createdAt: user.createdAt,
    });
  }

  return normalizeUserProfile(uid, user as unknown as Record<string, unknown>);
}

async function createOrLoadUserFirestore(
  uid: string,
  email: string,
  displayName: string | undefined,
  options: CreateUserOptions
): Promise<UserProfile> {
  const db = getFirestore();
  const ref = db.collection('users').doc(uid);
  const { profile, created } = await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (doc.exists) {
      const user = normalizeUserProfile(uid, doc.data() as Record<string, unknown>);
      if (options.authProvider && !user.authProviders.includes(options.authProvider)) {
        const authProviders = [...user.authProviders, options.authProvider];
        t.update(ref, { authProviders, updatedAt: new Date().toISOString() });
        user.authProviders = authProviders;
      }
      return { profile: user, created: false };
    }
    const user = createDefaultUser(uid, email, displayName, options.role || UserRole.USER);
    if (options.authProvider) {
      user.authProviders = [options.authProvider];
    }
    if (options.inviteCodeId) {
      user.inviteCodeId = options.inviteCodeId;
    }
    if (options.legalAcceptance) {
      user.legalAcceptance = options.legalAcceptance;
    }
    t.set(ref, omitUndefinedFields(user as unknown as Record<string, unknown>));
    return { profile: user, created: true };
  });

  if (created && DEFAULT_COINS > 0) {
    const { writeWelcomeLedgerOnly } = await import('./coins.service.js');
    await writeWelcomeLedgerOnly({
      userId: uid,
      amount: DEFAULT_COINS,
      createdAt: profile.createdAt,
    });
  }

  return profile;
}

export async function userExists(uid: string): Promise<boolean> {
  if (isDevMode()) {
    return Boolean(devStore.getUser(uid));
  }
  const db = getFirestore();
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists;
}

export async function getUserById(uid: string): Promise<UserProfile | null> {
  if (isDevMode()) {
    const user = devStore.getUser(uid);
    return user ? normalizeUserProfile(uid, user) : null;
  }

  const db = getFirestore();
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return normalizeUserProfile(uid, doc.data() as Record<string, unknown>);
}

export async function updateOwnProfile(
  uid: string,
  raw: Record<string, unknown>
): Promise<UserProfile> {
  const user = await getUserById(uid);
  if (!user) throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');

  for (const key of Object.keys(raw)) {
    if (key === 'email' || key === 'coinBalance' || key === 'role' || key === 'id') {
      throw new ServiceError(400, 'FORBIDDEN_FIELD', 'Dieses Feld darf nicht über das Profil geändert werden');
    }
    if (!PROFILE_PATCHABLE.has(key)) {
      throw new ServiceError(400, 'UNKNOWN_FIELD', `Unbekanntes Profil-Feld: ${key}`);
    }
  }

  const updates: Partial<UserProfile> = {};
  if (raw.displayName !== undefined) {
    updates.displayName = sanitizeDisplayName(raw.displayName);
  }
  if (raw.locale !== undefined) {
    if (!isNexterLanguage(raw.locale)) {
      throw new ServiceError(400, 'INVALID_LANGUAGE', 'Sprache wird nicht unterstützt');
    }
    updates.locale = raw.locale;
    updates.nexterPreferences = resolveNexterPreferences(
      { ...user.nexterPreferences, language: raw.locale, updatedAt: new Date().toISOString() },
      { locale: raw.locale, displayName: updates.displayName ?? user.displayName }
    );
  }
  if (Object.keys(updates).length === 0) return user;
  return updateUser(uid, updates);
}

export async function updateUser(
  uid: string,
  updates: Partial<UserProfile>
): Promise<UserProfile> {
  const now = new Date().toISOString();
  const payload = omitUndefinedFields({ ...updates, updatedAt: now } as Record<string, unknown>);

  if (isDevMode()) {
    const existing = await getUserById(uid);
    if (!existing) throw new Error('User not found');
    const updated = { ...existing, ...payload };
    devStore.saveUser(uid, updated as unknown as Record<string, unknown>);
    return normalizeUserProfile(uid, updated as unknown as Record<string, unknown>);
  }

  const db = getFirestore();
  await db.collection('users').doc(uid).update(payload);
  return (await getUserById(uid))!;
}

export async function updateCoinBalance(uid: string, newBalance: number): Promise<void> {
  if (isDevMode()) {
    const user = await getUserById(uid);
    if (!user) throw new Error('User not found');
    devStore.saveUser(uid, {
      ...user,
      coinBalance: newBalance,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const db = getFirestore();
  await db.collection('users').doc(uid).update({
    coinBalance: newBalance,
    updatedAt: new Date().toISOString(),
  });
}

export async function setUserRole(uid: string, role: UserRole): Promise<UserProfile> {
  return updateUser(uid, { role });
}

export async function listUsers(): Promise<UserProfile[]> {
  if (isDevMode()) {
    return Object.entries(devStore.getUsers()).map(([id, raw]) =>
      normalizeUserProfile(id, raw as Record<string, unknown>)
    );
  }
  const db = getFirestore();
  const snap = await db.collection('users').limit(200).get();
  return snap.docs.map((doc) => normalizeUserProfile(doc.id, doc.data() as Record<string, unknown>));
}

export async function searchUsers(query: string): Promise<UserProfile[]> {
  const q = query.trim().toLowerCase();
  const all = await listUsers();
  if (!q) return all.slice(0, 50);
  return all.filter(
    (u) =>
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
  );
}

export async function setUserDisabled(uid: string, disabled: boolean): Promise<UserProfile> {
  return updateUser(uid, { disabled });
}
