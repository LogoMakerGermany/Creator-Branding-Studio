import Stripe from 'stripe';
import { getPackageById } from './payment-credit.service.js';
import {
  isStripeConfigured,
  getStripeMode,
  isStripeLiveMode,
  getPrimaryFrontendUrl,
  getStripeSecretKey,
  getStripeWebhookSecret,
  getStripePriceId,
} from '../config/env.js';

let stripeClient: Stripe | null = null;

export { isStripeConfigured, getStripeMode, isStripeLiveMode };

export function getStripeClient(): Stripe | null {
  const secretKey = getStripeSecretKey();
  if (!secretKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export { getPackageById };

export async function createCheckoutSession(
  userId: string,
  email: string,
  packageId: string
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe nicht konfiguriert');
  }

  const pkg = getPackageById(packageId);
  if (!pkg) {
    throw new Error('Paket nicht gefunden');
  }

  const frontendUrl = getPrimaryFrontendUrl();
  const totalCoins = pkg.coins + pkg.bonusCoins;
  const priceId = getStripePriceId(packageId);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: pkg.currency || 'eur',
              product_data: {
                name: `${pkg.name} – ${totalCoins} Coins`,
                description: `${pkg.coins} Coins${pkg.bonusCoins ? ` + ${pkg.bonusCoins} Bonus` : ''}`,
              },
              unit_amount: pkg.priceCents,
            },
            quantity: 1,
          },
        ],
    metadata: {
      userId,
      packageId: pkg.id,
      coins: String(pkg.coins),
      bonusCoins: String(pkg.bonusCoins),
      mode: getStripeMode(),
      paymentKind: 'coin_package',
    },
    success_url: `${frontendUrl}/coins?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/coins?canceled=true`,
  });

  if (!session.url) {
    throw new Error('Checkout-URL konnte nicht erstellt werden');
  }

  return { url: session.url, sessionId: session.id };
}

/** Exact-amount Stripe Checkout for a server-validated price quote. */
export async function createQuoteCheckoutSession(
  userId: string,
  email: string,
  quoteId: string,
  totalCents: number,
  summary: string
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe nicht konfiguriert');
  }
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error('Ungültiger Zahlungsbetrag');
  }

  const frontendUrl = getPrimaryFrontendUrl();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Creator Auftrag',
            description: summary.slice(0, 450) || `Quote ${quoteId}`,
          },
          unit_amount: totalCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      quoteId,
      totalCents: String(totalCents),
      mode: getStripeMode(),
      paymentKind: 'order_quote',
    },
    success_url: `${frontendUrl}/coins?quote_success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/coins?canceled=true`,
  });

  if (!session.url) {
    throw new Error('Checkout-URL konnte nicht erstellt werden');
  }

  return { url: session.url, sessionId: session.id };
}

export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe nicht konfiguriert');
  }

  return stripe.checkout.sessions.retrieve(sessionId);
}

export async function constructWebhookEvent(
  payload: Buffer | string,
  signature: string
): Promise<Stripe.Event> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe nicht konfiguriert');
  }

  const secret = getStripeWebhookSecret();
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET nicht konfiguriert');
  }

  return stripe.webhooks.constructEvent(payload, signature, secret);
}
