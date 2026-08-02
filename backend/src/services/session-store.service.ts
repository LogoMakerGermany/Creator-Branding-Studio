import { devStore } from '../lib/dev-store.js';
import { isDevMode } from '../config/env.js';

const COLLECTION = 'processedStripeSessions';
const PAYPAL_COLLECTION = 'processedPayPalOrders';

export async function isStripeSessionProcessed(sessionId: string): Promise<boolean> {
  if (isDevMode()) {
    return devStore.isSessionProcessed(`stripe:${sessionId}`);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const doc = await db.collection(COLLECTION).doc(sessionId).get();
  return doc.exists;
}

/** Atomically claim a Stripe session. Returns false if already processed. */
export async function claimStripeSession(
  sessionId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<boolean> {
  if (isDevMode()) {
    if (devStore.isSessionProcessed(`stripe:${sessionId}`)) return false;
    devStore.markSessionProcessed(`stripe:${sessionId}`);
    return true;
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(sessionId);

  try {
    await ref.create({
      ...data,
      processedAt: new Date().toISOString(),
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
  if (isDevMode()) {
    return devStore.isSessionProcessed(`paypal:${orderId}`);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const doc = await db.collection(PAYPAL_COLLECTION).doc(orderId).get();
  return doc.exists;
}

/** Atomically claim a PayPal order. Returns false if already processed. */
export async function claimPayPalOrder(
  orderId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<boolean> {
  if (isDevMode()) {
    if (devStore.isSessionProcessed(`paypal:${orderId}`)) return false;
    devStore.markSessionProcessed(`paypal:${orderId}`);
    return true;
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const ref = db.collection(PAYPAL_COLLECTION).doc(orderId);

  try {
    await ref.create({
      ...data,
      processedAt: new Date().toISOString(),
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 6 /* ALREADY_EXISTS */) return false;
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
