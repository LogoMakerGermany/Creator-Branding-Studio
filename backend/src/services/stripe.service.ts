import Stripe from 'stripe';
import { COIN_PACKAGES } from './coins.service.js';
import { getPackageById } from './payment-credit.service.js';
import {
  isStripeConfigured,
  getStripeMode,
  isStripeLiveMode,
  getPrimaryFrontendUrl,
} from '../config/env.js';

let stripeClient: Stripe | null = null;

export { isStripeConfigured, getStripeMode, isStripeLiveMode };

export function getStripeClient(): Stripe | null {
  if (!isStripeConfigured()) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}

export { getPackageById };

function getStripePriceId(packageId: string): string | undefined {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    ultimate: process.env.STRIPE_PRICE_ULTIMATE,
  };
  return map[packageId];
}

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
    },
    success_url: `${frontendUrl}/coins?success=true&session_id={CHECKOUT_SESSION_ID}`,
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

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET nicht konfiguriert');
  }

  return stripe.webhooks.constructEvent(payload, signature, secret);
}
