import crypto from 'crypto';
import { env } from '../config.js';

const WEBHOOK_TOLERANCE_SEC = 300;

export function verifyStripeWebhookSignature(
  payload: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): void {
  if (!signatureHeader) {
    throw new Error('Stripe-Signatur fehlt');
  }

  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    throw new Error('Ungültiges Stripe-Signaturformat');
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (Number.isNaN(age) || age > WEBHOOK_TOLERANCE_SEC) {
    throw new Error('Stripe-Webhook-Zeitstempel abgelaufen');
  }

  const signedPayload = `${timestamp}.${payload.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
    throw new Error('Ungültige Stripe-Signatur');
  }
}

export function parseStripeEvent(payload: Buffer): {
  type?: string;
  data?: { object?: { metadata?: { paymentId?: string; userId?: string }; id?: string } };
} {
  return JSON.parse(payload.toString('utf8')) as {
    type?: string;
    data?: { object?: { metadata?: { paymentId?: string; userId?: string }; id?: string } };
  };
}

export function stripeWebhookConfigured(): boolean {
  return Boolean(env.stripeWebhookSecret);
}
