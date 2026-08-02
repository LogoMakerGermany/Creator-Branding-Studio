import { UserRole, SubscriptionTier } from '@ucbs/shared';
import { getDefaultFreeCoins } from '../config/env.js';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getFirestore } from '../config/firebase.js';

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
  inviteCodeId?: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_COINS = getDefaultFreeCoins();

function normalizeCoinBalance(raw: Record<string, unknown>): number {
  const fromBalance = raw.coinBalance;
  if (typeof fromBalance === 'number' && Number.isFinite(fromBalance)) {
    return Math.max(0, Math.floor(fromBalance));
  }

  const legacyCoins = raw.coins;
  if (typeof legacyCoins === 'number' && Number.isFinite(legacyCoins)) {
    return Math.max(0, Math.floor(legacyCoins));
  }

  return DEFAULT_COINS;
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
  return {
    id: uid,
    ...data,
    role: normalizeRole(data.role),
    coinBalance,
  } as UserProfile;
}

function createDefaultUser(
  uid: string,
  email: string,
  displayName?: string,
  role: UserRole = UserRole.USER
): UserProfile {
  const now = new Date().toISOString();
  return {
    id: uid,
    email,
    displayName: displayName || email.split('@')[0],
    role,
    authProviders: [],
    coinBalance: DEFAULT_COINS,
    balanceCents: 0,
    subscriptionTier: SubscriptionTier.FREE,
    locale: 'de',
    onboardingCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

export interface CreateUserOptions {
  authProvider?: string;
  role?: UserRole;
  inviteCodeId?: string;
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
    const existing = devStore.getUser(uid);
    if (existing) {
      const user = normalizeUserProfile(uid, existing);
      if (user.coinBalance !== existing.coinBalance) {
        devStore.saveUser(uid, user as unknown as Record<string, unknown>);
      }
      return user;
    }
    const user = createDefaultUser(uid, email, displayName, options.role || UserRole.USER);
    if (options.authProvider) {
      user.authProviders = [options.authProvider];
    }
    if (options.inviteCodeId) {
      user.inviteCodeId = options.inviteCodeId;
    }
    devStore.saveUser(uid, user as unknown as Record<string, unknown>);

    if (DEFAULT_COINS > 0) {
      devStore.addTransaction({
        id: `tx_${Date.now()}`,
        userId: uid,
        type: 'bonus',
        amount: DEFAULT_COINS,
        balanceAfter: DEFAULT_COINS,
        description: 'Willkommensbonus',
        createdAt: user.createdAt,
      });
    }

    return user;
  }

  const db = getFirestore();
  const ref = db.collection('users').doc(uid);
  const doc = await ref.get();

  if (doc.exists) {
    const user = normalizeUserProfile(uid, doc.data() as Record<string, unknown>);
    if (user.coinBalance !== doc.data()?.coinBalance) {
      await ref.update({ coinBalance: user.coinBalance, updatedAt: new Date().toISOString() });
    }
    if (options.authProvider && !user.authProviders.includes(options.authProvider)) {
      const authProviders = [...user.authProviders, options.authProvider];
      await ref.update({ authProviders, updatedAt: new Date().toISOString() });
      user.authProviders = authProviders;
    }
    return user;
  }

  const user = createDefaultUser(uid, email, displayName, options.role || UserRole.USER);
  if (options.authProvider) {
    user.authProviders = [options.authProvider];
  }
  if (options.inviteCodeId) {
    user.inviteCodeId = options.inviteCodeId;
  }
  await ref.set(user);

  if (DEFAULT_COINS > 0) {
    const { randomUUID } = await import('node:crypto');
    const welcomeTxId = randomUUID();
    await db.collection('coin_transactions').doc(welcomeTxId).set({
      id: welcomeTxId,
      userId: uid,
      type: 'bonus',
      amount: DEFAULT_COINS,
      balanceAfter: DEFAULT_COINS,
      description: 'Willkommensbonus',
      createdAt: user.createdAt,
    });
  }

  return user;
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

export async function updateUser(
  uid: string,
  updates: Partial<UserProfile>
): Promise<UserProfile> {
  const now = new Date().toISOString();
  const payload = { ...updates, updatedAt: now };

  if (isDevMode()) {
    const existing = await getUserById(uid);
    if (!existing) throw new Error('User not found');
    const updated = { ...existing, ...payload };
    devStore.saveUser(uid, updated as unknown as Record<string, unknown>);
    return updated;
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
