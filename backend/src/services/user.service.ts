import { UserRole, SubscriptionTier } from '@ucbs/shared';
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
  subscriptionTier: SubscriptionTier;
  locale: string;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_COINS = parseInt(process.env.DEFAULT_FREE_COINS || '50', 10);

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

function normalizeUserProfile(uid: string, data: Record<string, unknown>): UserProfile {
  const coinBalance = normalizeCoinBalance(data);
  return {
    id: uid,
    ...data,
    coinBalance,
  } as UserProfile;
}

function createDefaultUser(uid: string, email: string, displayName?: string): UserProfile {
  const now = new Date().toISOString();
  return {
    id: uid,
    email,
    displayName: displayName || email.split('@')[0],
    role: UserRole.CREATOR,
    authProviders: [],
    coinBalance: DEFAULT_COINS,
    subscriptionTier: SubscriptionTier.FREE,
    locale: 'de',
    onboardingCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  authProvider?: string
): Promise<UserProfile> {
  if (isDevMode()) {
    const existing = devStore.getUser(uid);
    if (existing) {
      const user = normalizeUserProfile(uid, existing);
      if (user.coinBalance !== existing.coinBalance) {
        devStore.saveUser(uid, user as unknown as Record<string, unknown>);
      }
      return user;
    }
    const user = createDefaultUser(uid, email, displayName);
    if (authProvider) {
      user.authProviders = [authProvider];
    }
    devStore.saveUser(uid, user as unknown as Record<string, unknown>);

    devStore.addTransaction({
      id: `tx_${Date.now()}`,
      userId: uid,
      type: 'bonus',
      amount: DEFAULT_COINS,
      balanceAfter: DEFAULT_COINS,
      description: 'Willkommensbonus',
      createdAt: user.createdAt,
    });

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
    if (authProvider && !user.authProviders.includes(authProvider)) {
      const authProviders = [...user.authProviders, authProvider];
      await ref.update({ authProviders, updatedAt: new Date().toISOString() });
      user.authProviders = authProviders;
    }
    return user;
  }

  const user = createDefaultUser(uid, email, displayName);
  if (authProvider) {
    user.authProviders = [authProvider];
  }
  await ref.set(user);

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

  return user;
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

export async function updateCoinBalance(
  uid: string,
  newBalance: number
): Promise<void> {
  if (isDevMode()) {
    const user = await getUserById(uid);
    if (!user) throw new Error('User not found');
    devStore.saveUser(uid, { ...user, coinBalance: newBalance, updatedAt: new Date().toISOString() });
    return;
  }

  const db = getFirestore();
  await db.collection('users').doc(uid).update({
    coinBalance: newBalance,
    updatedAt: new Date().toISOString(),
  });
}
