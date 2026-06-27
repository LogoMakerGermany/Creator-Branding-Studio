import { devStore } from '../lib/dev-store.js';
import { isDevMode } from '../config/env.js';

const COLLECTION = 'processedStripeSessions';

export async function isStripeSessionProcessed(sessionId: string): Promise<boolean> {
  if (isDevMode()) {
    return devStore.isSessionProcessed(`stripe:${sessionId}`);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const doc = await db.collection(COLLECTION).doc(sessionId).get();
  return doc.exists;
}

export async function markStripeSessionProcessed(
  sessionId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<void> {
  if (isDevMode()) {
    devStore.markSessionProcessed(`stripe:${sessionId}`);
    return;
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  await db.collection(COLLECTION).doc(sessionId).set({
    ...data,
    processedAt: new Date().toISOString(),
  });
}

const PAYPAL_COLLECTION = 'processedPayPalOrders';

export async function isPayPalOrderProcessed(orderId: string): Promise<boolean> {
  if (isDevMode()) {
    return devStore.isSessionProcessed(`paypal:${orderId}`);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const doc = await db.collection(PAYPAL_COLLECTION).doc(orderId).get();
  return doc.exists;
}

export async function markPayPalOrderProcessed(
  orderId: string,
  data: { userId?: string; packageId?: string; coins?: number }
): Promise<void> {
  if (isDevMode()) {
    devStore.markSessionProcessed(`paypal:${orderId}`);
    return;
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  await db.collection(PAYPAL_COLLECTION).doc(orderId).set({
    ...data,
    processedAt: new Date().toISOString(),
  });
}
