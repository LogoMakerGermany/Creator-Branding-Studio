import {
  getPrimaryFrontendUrl,
  isProduction,
  isPayPalConfigured,
  getPayPalMode,
  isPayPalLiveMode,
  getPayPalClientId,
  getPayPalClientSecret,
  getPayPalWebhookId,
} from '../config/env.js';
import { COIN_PACKAGES } from './coins.service.js';
import { getPackageById } from './payment-credit.service.js';

export { isPayPalConfigured, getPayPalMode, isPayPalLiveMode };

function getPayPalApiBase(): string {
  return getPayPalMode() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = getPayPalClientId()!;
  const clientSecret = getPayPalClientSecret()!;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth fehlgeschlagen: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

function buildCustomId(userId: string, packageId: string, coins: number, bonusCoins: number): string {
  return `${userId}|${packageId}|${coins}|${bonusCoins}`;
}

export function parseCustomId(customId: string): {
  userId: string;
  packageId: string;
  coins: number;
  bonusCoins: number;
} | null {
  const parts = customId.split('|');
  if (parts.length !== 4) return null;
  const coins = parseInt(parts[2], 10);
  const bonusCoins = parseInt(parts[3], 10);
  if (!parts[0] || !parts[1] || Number.isNaN(coins)) return null;
  return { userId: parts[0], packageId: parts[1], coins, bonusCoins: bonusCoins || 0 };
}

function formatEuroAmount(priceCents: number): string {
  return (priceCents / 100).toFixed(2);
}

export async function createPayPalOrder(
  userId: string,
  packageId: string
): Promise<{ url: string; orderId: string }> {
  const pkg = getPackageById(packageId);
  if (!pkg) throw new Error('Paket nicht gefunden');

  const token = await getAccessToken();
  const frontendUrl = getPrimaryFrontendUrl();
  const totalCoins = pkg.coins + pkg.bonusCoins;

  const res = await fetch(`${getPayPalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: packageId,
          custom_id: buildCustomId(userId, packageId, pkg.coins, pkg.bonusCoins),
          description: `${pkg.name} – ${totalCoins} Coins`,
          amount: {
            currency_code: (pkg.currency || 'eur').toUpperCase(),
            value: formatEuroAmount(pkg.priceCents),
          },
        },
      ],
      application_context: {
        brand_name: 'UCBS',
        locale: 'de-DE',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${frontendUrl}/coins?success=true&provider=paypal`,
        cancel_url: `${frontendUrl}/coins?canceled=true&provider=paypal`,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal Order fehlgeschlagen: ${text}`);
  }

  const order = (await res.json()) as {
    id: string;
    links: { rel: string; href: string }[];
  };

  const approveLink = order.links.find((l) => l.rel === 'approve');
  if (!approveLink?.href) {
    throw new Error('PayPal Approval-URL konnte nicht erstellt werden');
  }

  return { url: approveLink.href, orderId: order.id };
}

export interface PayPalOrderDetails {
  id: string;
  status: string;
  userId?: string;
  packageId?: string;
  coins: number;
  bonusCoins: number;
  amountCents?: number;
}

export async function getPayPalOrder(orderId: string): Promise<PayPalOrderDetails> {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalApiBase()}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal Order abrufen fehlgeschlagen: ${text}`);
  }

  const order = (await res.json()) as {
    id: string;
    status: string;
    purchase_units: {
      custom_id?: string;
      amount?: { value: string; currency_code: string };
      payments?: { captures?: { amount: { value: string }; status: string }[] };
    }[];
  };

  const unit = order.purchase_units[0];
  const parsed = unit?.custom_id ? parseCustomId(unit.custom_id) : null;
  const captureAmount = unit?.payments?.captures?.[0]?.amount?.value ?? unit?.amount?.value;
  const amountCents = captureAmount
    ? Math.round(parseFloat(captureAmount) * 100)
    : undefined;

  return {
    id: order.id,
    status: order.status,
    userId: parsed?.userId,
    packageId: parsed?.packageId,
    coins: parsed?.coins ?? 0,
    bonusCoins: parsed?.bonusCoins ?? 0,
    amountCents,
  };
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalOrderDetails> {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalApiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal Capture fehlgeschlagen: ${text}`);
  }

  return getPayPalOrder(orderId);
}

export async function verifyPayPalWebhookEvent(
  headers: Record<string, string | string[] | undefined>,
  event: unknown
): Promise<boolean> {
  const webhookId = getPayPalWebhookId();
  if (!webhookId) {
    if (isProduction()) {
      console.error('[PayPal] PAYPAL_WEBHOOK_ID fehlt — Webhook abgelehnt');
      return false;
    }
    return true;
  }

  const header = (key: string) => {
    const value = headers[key.toLowerCase()] ?? headers[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const transmissionId = header('paypal-transmission-id');
  const transmissionTime = header('paypal-transmission-time');
  const certUrl = header('paypal-cert-url');
  const authAlgo = header('paypal-auth-algo');
  const transmissionSig = header('paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false;
  }

  const token = await getAccessToken();
  const res = await fetch(`${getPayPalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });

  if (!res.ok) {
    console.error('[PayPal] Webhook verify failed:', await res.text());
    return false;
  }

  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === 'SUCCESS';
}

export { COIN_PACKAGES };
