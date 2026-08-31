import { isDevMode } from '../config/env.js';
import { devStore } from '../lib/dev-store.js';
import { paymentLockKey, withDevLock } from '../lib/dev-mutex.js';

const COLLECTION = 'processedStripeSessions';
const PAYPAL_COLLECTION = 'processedPayPalOrders';

export type PaymentClaimStatus = 'processing' | 'credited' | 'failed';

export interface PaymentClaim {
  id: string;
  provider: 'stripe' | 'paypal';
  status: PaymentClaimStatus;
  userId?: string;
  packageId?: string;
  coins?: number;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  error?: string;
  emailSent?: boolean;
}

function collectionName(provider: 'stripe' | 'paypal'): string {
  return provider === 'stripe' ? COLLECTION : PAYPAL_COLLECTION;
}

async function readClaim(
  provider: 'stripe' | 'paypal',
  paymentId: string
): Promise<PaymentClaim | null> {
  if (isDevMode()) {
    const row = devStore.getFromCollection(collectionName(provider), paymentId);
    if (!row) {
      if (provider === 'stripe' && devStore.isSessionProcessed(`stripe:${paymentId}`)) {
        return {
          id: paymentId,
          provider,
          status: 'credited',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
        };
      }
      return null;
    }
    return row as unknown as PaymentClaim;
  }
  const { getFirestore } = await import('../config/firebase.js');
  const snap = await getFirestore().collection(collectionName(provider)).doc(paymentId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as PaymentClaim;
}

async function writeClaim(claim: PaymentClaim): Promise<void> {
  const now = new Date().toISOString();
  const row = { ...claim, updatedAt: now };
  if (isDevMode()) {
    devStore.saveToCollection(collectionName(claim.provider), claim.id, row as unknown as Record<string, unknown>);
    if (claim.status === 'credited') {
      devStore.markSessionProcessed(`${claim.provider}:${claim.id}`);
    }
    return;
  }
  const { getFirestore } = await import('../config/firebase.js');
  await getFirestore().collection(collectionName(claim.provider)).doc(claim.id).set(row, { merge: true });
}

export async function getPaymentClaim(
  provider: 'stripe' | 'paypal',
  paymentId: string
): Promise<PaymentClaim | null> {
  return readClaim(provider, paymentId);
}

export async function listPaymentClaims(provider: 'stripe' | 'paypal', limit = 50): Promise<PaymentClaim[]> {
  if (isDevMode()) {
    return devStore
      .listCollection(collectionName(provider))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      .slice(0, limit) as unknown as PaymentClaim[];
  }
  const { getFirestore } = await import('../config/firebase.js');
  const snap = await getFirestore().collection(collectionName(provider)).limit(limit).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as PaymentClaim)
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

export async function beginPaymentCredit(
  provider: 'stripe' | 'paypal',
  paymentId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<{ action: 'proceed' | 'duplicate'; claim: PaymentClaim }> {
  const run = async (): Promise<{ action: 'proceed' | 'duplicate'; claim: PaymentClaim }> => {
    const existing = await readClaim(provider, paymentId);
    if (existing?.status === 'credited') {
      return { action: 'duplicate', claim: existing };
    }
    const now = new Date().toISOString();
    const claim: PaymentClaim = existing
      ? { ...existing, ...data, status: 'processing', updatedAt: now }
      : {
          id: paymentId,
          provider,
          status: 'processing',
          ...data,
          createdAt: now,
          updatedAt: now,
        };
    await writeClaim(claim);
    return { action: 'proceed', claim };
  };

  if (isDevMode()) {
    return withDevLock(paymentLockKey(provider, paymentId), run);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const ref = db.collection(collectionName(provider)).doc(paymentId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const now = new Date().toISOString();
    if (snap.exists) {
      const existing = { id: snap.id, ...snap.data() } as PaymentClaim;
      if (existing.status === 'credited') {
        return { action: 'duplicate' as const, claim: existing };
      }
      const claim: PaymentClaim = {
        ...existing,
        ...data,
        status: 'processing',
        updatedAt: now,
      };
      t.set(ref, claim, { merge: true });
      return { action: 'proceed' as const, claim };
    }
    const claim: PaymentClaim = {
      id: paymentId,
      provider,
      status: 'processing',
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    t.create(ref, claim);
    return { action: 'proceed' as const, claim };
  });
}

export async function markPaymentCredited(
  provider: 'stripe' | 'paypal',
  paymentId: string,
  extra?: Partial<PaymentClaim>
): Promise<void> {
  const existing = (await readClaim(provider, paymentId)) ?? {
    id: paymentId,
    provider,
    status: 'credited' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeClaim({
    ...existing,
    ...extra,
    status: 'credited',
    processedAt: new Date().toISOString(),
  });
}

export async function markPaymentFailed(
  provider: 'stripe' | 'paypal',
  paymentId: string,
  error: string
): Promise<void> {
  const existing = await readClaim(provider, paymentId);
  if (existing?.status === 'credited') return;
  const now = new Date().toISOString();
  await writeClaim({
    ...(existing ?? { id: paymentId, provider, createdAt: now, updatedAt: now }),
    status: 'failed',
    error: error.slice(0, 500),
    updatedAt: now,
  });
}

export async function markPaymentEmailSent(
  provider: 'stripe' | 'paypal',
  paymentId: string
): Promise<void> {
  const existing = await readClaim(provider, paymentId);
  if (!existing) return;
  await writeClaim({ ...existing, emailSent: true });
}

export async function isStripeSessionProcessed(sessionId: string): Promise<boolean> {
  const claim = await readClaim('stripe', sessionId);
  return claim?.status === 'credited';
}

/** Atomically claim a Stripe session for euro-ledger quotes. Returns false if already processed. */
export async function claimStripeSession(
  sessionId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<boolean> {
  if (isDevMode()) {
    return withDevLock(paymentLockKey('stripe', sessionId), async () => {
      if (devStore.isSessionProcessed(`stripe:${sessionId}`)) return false;
      const existing = await readClaim('stripe', sessionId);
      if (existing?.status === 'credited') return false;
      devStore.markSessionProcessed(`stripe:${sessionId}`);
      const now = new Date().toISOString();
      await writeClaim({
        id: sessionId,
        provider: 'stripe',
        status: 'credited',
        ...data,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        processedAt: now,
      });
      return true;
    });
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(sessionId);
  const now = new Date().toISOString();

  try {
    await ref.create({
      ...data,
      id: sessionId,
      provider: 'stripe',
      status: 'credited',
      processedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 6 /* ALREADY_EXISTS */) return false;
    throw err;
  }
}

/** @deprecated Use claimStripeSession */
export async function markStripeSessionProcessed(
  sessionId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<void> {
  await claimStripeSession(sessionId, data);
}

export async function isPayPalOrderProcessed(orderId: string): Promise<boolean> {
  const claim = await readClaim('paypal', orderId);
  return claim?.status === 'credited';
}

export async function claimPayPalOrder(
  orderId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<boolean> {
  if (isDevMode()) {
    return withDevLock(paymentLockKey('paypal', orderId), async () => {
      if (devStore.isSessionProcessed(`paypal:${orderId}`)) return false;
      const existing = await readClaim('paypal', orderId);
      if (existing?.status === 'credited') return false;
      devStore.markSessionProcessed(`paypal:${orderId}`);
      const now = new Date().toISOString();
      await writeClaim({
        id: orderId,
        provider: 'paypal',
        status: 'credited',
        ...data,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        processedAt: now,
      });
      return true;
    });
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const ref = db.collection(PAYPAL_COLLECTION).doc(orderId);
  const now = new Date().toISOString();
  try {
    await ref.create({
      ...data,
      id: orderId,
      provider: 'paypal',
      status: 'credited',
      processedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 6) return false;
    throw err;
  }
}

/** @deprecated Use claimPayPalOrder */
export async function markPayPalOrderProcessed(
  orderId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<void> {
  await claimPayPalOrder(orderId, data);
}
