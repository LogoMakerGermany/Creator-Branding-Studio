import {
  COIN_PACKAGES,
  type CoinPackage,
  type PaymentRecord,
} from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { env } from '../config.js';
import { withUserCoinLock } from './coinLock.js';
import { parseStripeEvent, verifyStripeWebhookSignature } from './stripeWebhook.js';

export function listPackages(): CoinPackage[] {
  return COIN_PACKAGES;
}

function mockPaymentsAllowed(): boolean {
  return env.allowMockPayments && !env.isProduction;
}

export async function createStripeCheckout(userId: string, packageId: string): Promise<{ url: string; paymentId: string }> {
  const pkg = COIN_PACKAGES.find(p => p.id === packageId);
  if (!pkg) throw new Error('Paket nicht gefunden');

  const db = await getDb();
  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    userId,
    provider: 'stripe',
    packageId,
    coins: pkg.coins,
    amountEur: pkg.priceEur,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await db.createPayment(payment);

  if (!env.stripeSecretKey) {
    if (!mockPaymentsAllowed()) {
      throw new Error('Stripe ist nicht konfiguriert.');
    }
    await completePayment(payment.id);
    return { url: `/coins?success=mock&payment=${payment.id}`, paymentId: payment.id };
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][product_data][name]': `${pkg.name} – ${pkg.coins} Coins`,
      'line_items[0][price_data][unit_amount]': String(Math.round(pkg.priceEur * 100)),
      'line_items[0][quantity]': '1',
      success_url: `${env.corsOrigin}/coins?success=stripe&payment=${payment.id}`,
      cancel_url: `${env.corsOrigin}/coins?cancelled=1`,
      'metadata[userId]': userId,
      'metadata[paymentId]': payment.id,
    }),
  });

  if (!res.ok) throw new Error(`Stripe Fehler: ${await res.text()}`);
  const session = await res.json() as { url: string; id: string };
  await db.updatePayment(payment.id, { externalId: session.id });
  return { url: session.url, paymentId: payment.id };
}

export async function createPayPalCheckout(userId: string, packageId: string): Promise<{ url: string; paymentId: string }> {
  const pkg = COIN_PACKAGES.find(p => p.id === packageId);
  if (!pkg) throw new Error('Paket nicht gefunden');

  const db = await getDb();
  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    userId,
    provider: 'paypal',
    packageId,
    coins: pkg.coins,
    amountEur: pkg.priceEur,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await db.createPayment(payment);

  if (!env.paypalClientId) {
    if (!mockPaymentsAllowed()) {
      throw new Error('PayPal ist nicht konfiguriert.');
    }
    await completePayment(payment.id);
    return { url: `/coins?success=mock&payment=${payment.id}`, paymentId: payment.id };
  }

  throw new Error('PayPal Checkout: Client konfiguriert – Order-Erstellung in Produktion aktivieren.');
}

export async function completePayment(paymentId: string): Promise<void> {
  const db = await getDb();
  const payment = await db.getPayment(paymentId);
  if (!payment || payment.status === 'completed' || payment.status === 'mock') return;

  const finalStatus = env.stripeSecretKey || env.paypalClientId ? 'completed' : 'mock';

  await withUserCoinLock(payment.userId, async () => {
    await db.finalizePayment(paymentId, finalStatus, {
      id: crypto.randomUUID(),
      userId: payment.userId,
      type: 'purchase',
      amount: payment.coins,
      balanceAfter: 0,
      reason: `Kauf: ${payment.packageId}`,
      metadata: { provider: payment.provider, paymentId },
      createdAt: new Date().toISOString(),
    });
  });
}

export async function handleStripeWebhook(payload: Buffer, signature?: string): Promise<void> {
  if (!env.stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET nicht konfiguriert');
  }

  verifyStripeWebhookSignature(payload, signature, env.stripeWebhookSecret);
  const event = parseStripeEvent(payload);

  if (event.type !== 'checkout.session.completed') return;

  const paymentId = event.data?.object?.metadata?.paymentId;
  if (!paymentId) {
    throw new Error('Stripe-Event ohne paymentId in metadata');
  }

  const db = await getDb();
  const payment = await db.getPayment(paymentId);
  if (!payment) {
    throw new Error(`Unbekannte Zahlung: ${paymentId}`);
  }

  const sessionUserId = event.data?.object?.metadata?.userId;
  if (sessionUserId && sessionUserId !== payment.userId) {
    throw new Error('Stripe payment userId stimmt nicht überein');
  }

  await completePayment(paymentId);
}

export async function listUserPayments(userId: string): Promise<PaymentRecord[]> {
  const db = await getDb();
  const all = await db.listPayments(200);
  return all.filter(p => p.userId === userId);
}
