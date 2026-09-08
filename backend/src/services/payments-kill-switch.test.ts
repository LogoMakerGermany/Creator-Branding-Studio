import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../middleware/errorHandler.js';
import { arePaymentsEnabled } from '../config/env.js';
import { assertNewPaymentsAllowed, PAYMENTS_DISABLED_CODE } from '../lib/payments-gate.js';
import { createCheckoutSession } from './stripe.service.js';
import { createPayPalOrder } from './paypal.service.js';
import { getOrCreateUser, getUserById } from './user.service.js';
import { getCoinBalance } from './coins.service.js';
import { getSystemSettings, updateSystemSettings } from './system-settings.service.js';

process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function routeHandler(source: string, route: string): string {
  const needle = `'${route}'`;
  const idx = source.indexOf(needle);
  assert.ok(idx >= 0, `route ${route} not found`);
  const next = source.indexOf('.post(', idx + needle.length);
  return source.slice(idx, next === -1 ? undefined : next);
}

async function withPaymentsEnv<T>(value: string | undefined, fn: () => Promise<T> | T): Promise<T> {
  const prev = process.env.PAYMENTS_ENABLED;
  try {
    if (value === undefined) {
      delete process.env.PAYMENTS_ENABLED;
    } else {
      process.env.PAYMENTS_ENABLED = value;
    }
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.PAYMENTS_ENABLED;
    } else {
      process.env.PAYMENTS_ENABLED = prev;
    }
  }
}

function isPaymentsDisabledError(err: unknown): boolean {
  return (
    err instanceof AppError &&
    err.code === PAYMENTS_DISABLED_CODE &&
    err.statusCode === 503
  );
}

describe('P1 payment kill switch — PAYMENTS_ENABLED', () => {
  it('missing, empty, false, and invalid values disable payments', async () => {
    await withPaymentsEnv(undefined, () => {
      assert.equal(arePaymentsEnabled(), false);
    });
    await withPaymentsEnv('', () => {
      assert.equal(arePaymentsEnabled(), false);
    });
    await withPaymentsEnv('   ', () => {
      assert.equal(arePaymentsEnabled(), false);
    });
    await withPaymentsEnv('false', () => {
      assert.equal(arePaymentsEnabled(), false);
    });
    await withPaymentsEnv('yes', () => {
      assert.equal(arePaymentsEnabled(), false);
    });
    await withPaymentsEnv('1', () => {
      assert.equal(arePaymentsEnabled(), false);
    });
    await withPaymentsEnv('true', () => {
      assert.equal(arePaymentsEnabled(), true);
    });
    await withPaymentsEnv('TRUE', () => {
      assert.equal(arePaymentsEnabled(), true);
    });
  });

  it('PAYMENTS_ENABLED=false blocks Stripe checkout and PayPal order without provider calls', async () => {
    await withPaymentsEnv('false', async () => {
      await assert.rejects(assertNewPaymentsAllowed, isPaymentsDisabledError);
      await assert.rejects(
        () => createCheckoutSession('user-kill-switch', 'kill@test.local', 'starter'),
        isPaymentsDisabledError
      );
      await assert.rejects(
        () => createPayPalOrder('user-kill-switch', 'starter'),
        isPaymentsDisabledError
      );
    });
  });

  it('PAYMENTS_ENABLED missing blocks Stripe checkout and PayPal order', async () => {
    await withPaymentsEnv(undefined, async () => {
      await assert.rejects(assertNewPaymentsAllowed, isPaymentsDisabledError);
      await assert.rejects(
        () => createCheckoutSession('user-kill-switch', 'kill@test.local', 'starter'),
        isPaymentsDisabledError
      );
      await assert.rejects(
        () => createPayPalOrder('user-kill-switch', 'starter'),
        isPaymentsDisabledError
      );
    });
  });

  it('PAYMENTS_ENABLED=true keeps the payment gate open without creating a provider checkout', async () => {
    const settings = await getSystemSettings();
    const previous = settings.paymentsEnabled;
    try {
      if (!previous) {
        await updateSystemSettings({ paymentsEnabled: true }, 'payments-kill-switch-test');
      }
      await withPaymentsEnv('true', async () => {
        await assertNewPaymentsAllowed();
        assert.equal(arePaymentsEnabled(), true);
      });
    } finally {
      if (!previous) {
        await updateSystemSettings({ paymentsEnabled: false }, 'payments-kill-switch-test');
      }
    }
  });

  it('disabled payments do not credit coins or change subscription tier', async () => {
    const user = await getOrCreateUser(`pay-ks-${randomUUID()}`, 'pay-ks@test.local', 'Kill Switch');
    const beforeBalance = await getCoinBalance(user.id);
    const beforeTier = user.subscriptionTier;

    await withPaymentsEnv('false', async () => {
      await assert.rejects(
        () => createCheckoutSession(user.id, user.email, 'starter'),
        isPaymentsDisabledError
      );
      await assert.rejects(() => createPayPalOrder(user.id, 'pro'), isPaymentsDisabledError);
    });

    assert.equal(await getCoinBalance(user.id), beforeBalance);
    const after = await getUserById(user.id);
    assert.equal(after?.subscriptionTier, beforeTier);
  });

  it('checkout routes gate before provider APIs; webhooks stay ungated', () => {
    const stripe = src('src/routes/stripe.routes.ts');
    const paypal = src('src/routes/paypal.routes.ts');
    const pricing = src('src/routes/pricing.routes.ts');
    const stripeService = src('src/services/stripe.service.ts');
    const paypalService = src('src/services/paypal.service.ts');
    const env = src('src/config/env.ts');
    const status = src('src/routes/status.routes.ts');
    const example = src('.env.example');
    const coinsPage = repo('frontend/src/pages/coins/CoinsPage.tsx');
    const api = repo('frontend/src/services/api.ts');

    assert.match(env, /readEnv\('PAYMENTS_ENABLED'\)\?\.toLowerCase\(\) === 'true'/);

    const stripeCheckout = routeHandler(stripe, '/checkout');
    assert.match(stripeCheckout, /assertNewPaymentsAllowed/);
    assert.ok(stripeCheckout.indexOf('assertNewPaymentsAllowed') < stripeCheckout.indexOf('createCheckoutSession'));
    assert.ok(stripeCheckout.indexOf('assertNewPaymentsAllowed') < stripeCheckout.indexOf('isStripeConfigured'));

    const paypalCheckout = routeHandler(paypal, '/checkout');
    assert.match(paypalCheckout, /assertNewPaymentsAllowed/);
    assert.ok(paypalCheckout.indexOf('assertNewPaymentsAllowed') < paypalCheckout.indexOf('createPayPalOrder'));
    assert.ok(paypalCheckout.indexOf('assertNewPaymentsAllowed') < paypalCheckout.indexOf('isPayPalConfigured'));

    const stripeDev = routeHandler(stripe, '/dev-purchase');
    assert.match(stripeDev, /assertNewPaymentsAllowed/);
    assert.ok(stripeDev.indexOf('assertNewPaymentsAllowed') < stripeDev.indexOf('addCoins'));

    const paypalDev = routeHandler(paypal, '/dev-purchase');
    assert.match(paypalDev, /assertNewPaymentsAllowed/);
    assert.ok(paypalDev.indexOf('assertNewPaymentsAllowed') < paypalDev.indexOf('addCoins'));

    const pricingCheckout = routeHandler(pricing, '/checkout');
    assert.match(pricingCheckout, /assertNewPaymentsAllowed/);
    assert.ok(pricingCheckout.indexOf('assertNewPaymentsAllowed') < pricingCheckout.indexOf('createQuoteCheckoutSession'));

    const payWithBalance = routeHandler(pricing, '/pay-with-balance');
    assert.match(payWithBalance, /assertNewPaymentsAllowed/);
    assert.ok(payWithBalance.indexOf('assertNewPaymentsAllowed') < payWithBalance.indexOf('chargeOrderFromBalance'));

    const stripeWebhook = routeHandler(stripe, '/webhook');
    assert.equal(stripeWebhook.includes('assertNewPaymentsAllowed'), false);
    assert.match(stripeWebhook, /constructWebhookEvent/);
    assert.match(stripeWebhook, /stripe-signature/);

    const paypalWebhook = routeHandler(paypal, '/webhook');
    assert.equal(paypalWebhook.includes('assertNewPaymentsAllowed'), false);
    assert.match(paypalWebhook, /verifyPayPalWebhookEvent/);

    const stripeVerify = routeHandler(stripe, '/verify-session');
    assert.equal(stripeVerify.includes('assertNewPaymentsAllowed'), false);

    const paypalVerify = routeHandler(paypal, '/verify-order');
    assert.equal(paypalVerify.includes('assertNewPaymentsAllowed'), false);

    assert.match(stripeService, /await assertNewPaymentsAllowed\(\);/);
    assert.match(paypalService, /await assertNewPaymentsAllowed\(\);/);
    assert.match(stripeService, /mode: 'payment'/);
    assert.equal(stripeService.includes("mode: 'subscription'"), false);

    assert.match(status, /arePaymentsEnabled\(\) && \(settings\?\.paymentsEnabled \?\? true\)/);
    assert.match(example, /PAYMENTS_ENABLED=false/);
    assert.equal(example.includes('PAYMENTS_ENABLED=true'), false);

    assert.match(coinsPage, /killSwitches\?\.paymentsEnabled/);
    assert.match(coinsPage, /PAYMENTS_DISABLED/);
    assert.match(api, /PAYMENTS_DISABLED/);
  });
});
