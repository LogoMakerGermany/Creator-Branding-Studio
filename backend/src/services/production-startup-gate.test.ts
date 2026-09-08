import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoinSpendCategory } from '@ucbs/shared';
import {
  arePaymentsEnabled,
  collectProductionConfigIssues,
  getAiProviderStatus,
  getFrontendUrls,
  isDevMode,
} from '../config/env.js';
import { validateProductionConfig } from '../config/startup-validation.js';
import { assertNewPaymentsAllowed, PAYMENTS_DISABLED_CODE } from '../lib/payments-gate.js';
import { requireImageProvider } from '../lib/media-providers.js';
import { ServiceError } from '../lib/errors.js';
import { AppError } from '../middleware/errorHandler.js';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { getCoinBalance } from './coins.service.js';
import { generateStudioAsset } from './ai.service.js';
import { generateLogoAsset } from './logo.service.js';
import { createCheckoutSession } from './stripe.service.js';
import { createPayPalOrder } from './paypal.service.js';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

const DUMMY_PEM = '-----BEGIN PRIVATE KEY-----\nMIIBTESTKEY\n-----END PRIVATE KEY-----';
const FIREBASE_BASE = {
  FIREBASE_PROJECT_ID: 'nexter-creator-studio',
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@nexter-creator-studio.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: DUMMY_PEM,
  FIREBASE_STORAGE_BUCKET: 'nexter-creator-studio.firebasestorage.app',
  PUBLIC_FIREBASE_API_KEY: 'test-public-web-key',
  PUBLIC_FIREBASE_PROJECT_ID: 'nexter-creator-studio',
  FRONTEND_URL: 'http://localhost:5173',
  SERVE_STATIC: 'true',
} as const;

const CLEARED = {
  STRIPE_SECRET_KEY: undefined,
  STRIPE_WEBHOOK_SECRET: undefined,
  OPENAI_API_KEY: undefined,
  REPLICATE_API_TOKEN: undefined,
  RUNWAY_API_KEY: undefined,
  ELEVENLABS_API_KEY: undefined,
  PAYPAL_CLIENT_ID: undefined,
  PAYPAL_CLIENT_SECRET: undefined,
} as const;

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const keys = Object.keys(patch);
  const prev: Record<string, string | undefined> = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function issueNames(): string[] {
  return collectProductionConfigIssues().map((issue) => issue.variable);
}

function isPaymentsDisabledError(err: unknown): boolean {
  return err instanceof AppError && err.code === PAYMENTS_DISABLED_CODE && err.statusCode === 503;
}

describe('production startup gate — payments off, providers optional, Firebase required', () => {
  it('A) production starts with payments off, Stripe missing, AI missing, Firebase valid', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        PAYMENTS_ENABLED: 'false',
        DEV_AUTH_BYPASS: undefined,
        ...FIREBASE_BASE,
        ...CLEARED,
      },
      () => {
        assert.equal(arePaymentsEnabled(), false);
        assert.equal(isDevMode(), false);
        const names = issueNames();
        assert.equal(names.includes('STRIPE_SECRET_KEY'), false);
        assert.equal(names.includes('STRIPE_WEBHOOK_SECRET'), false);
        assert.equal(names.includes('OPENAI_API_KEY'), false);
        assert.equal(names.includes('FIREBASE_PROJECT_ID'), false);
        assert.equal(names.includes('FIREBASE_CLIENT_EMAIL'), false);
        assert.equal(names.includes('FIREBASE_PRIVATE_KEY'), false);
        assert.equal(names.includes('FIREBASE_STORAGE_BUCKET'), false);
        assert.equal(names.includes('PUBLIC_FIREBASE_API_KEY'), false);
        assert.equal(validateProductionConfig(), true);
      }
    );
  });

  it('B) PAYMENTS_ENABLED=true without Stripe secrets fail-closes startup', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        PAYMENTS_ENABLED: 'true',
        DEV_AUTH_BYPASS: undefined,
        ...FIREBASE_BASE,
        ...CLEARED,
      },
      () => {
        const names = issueNames();
        assert.equal(names.includes('STRIPE_SECRET_KEY'), true);
        assert.equal(names.includes('STRIPE_WEBHOOK_SECRET'), true);
        assert.equal(validateProductionConfig(), false);
      }
    );
  });

  it('C) missing image provider blocks before charge and does not call a provider', async () => {
    process.env.DEV_AUTH_BYPASS = 'true';
    const user = await getOrCreateUser(`gate-c-${randomUUID()}`, 'gate-c@test.local', 'Gate');
    await upsertDna({
      userId: user.id,
      name: 'GateWolf',
      mascot: 'Wolf',
      styleDirection: 'neon',
      primaryColors: ['#1E40AF'],
    });
    const before = await getCoinBalance(user.id);
    assert.throws(
      () => requireImageProvider(),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    await assert.rejects(
      () => generateStudioAsset(user.id, 'logo', CoinSpendCategory.LOGO_GENERATION, 'Logo'),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    await assert.rejects(
      () => generateLogoAsset(user.id, undefined, { name: 'GateWolf' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.match(repo('backend/src/services/ai.service.ts'), /assertImageProviderReadyForStudio\(module\)/);
    const logoSrc = repo('backend/src/services/logo.service.ts');
    const generateLogo = logoSrc.slice(logoSrc.indexOf('export async function generateLogoAsset'));
    assert.match(generateLogo, /assertImageProviderReadyForStudio\('logo'\)/);
    assert.ok(
      generateLogo.indexOf("assertImageProviderReadyForStudio('logo')") < generateLogo.indexOf('withCoinCharge')
    );
  });

  it('D) missing Firebase Admin value fail-closes production', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        PAYMENTS_ENABLED: 'false',
        DEV_AUTH_BYPASS: undefined,
        ...FIREBASE_BASE,
        ...CLEARED,
        FIREBASE_PROJECT_ID: undefined,
      },
      () => {
        assert.equal(issueNames().includes('FIREBASE_PROJECT_ID'), true);
        assert.equal(validateProductionConfig(), false);
      }
    );
  });

  it('E) DEV_AUTH_BYPASS=true in production fail-closes and never enables the Dev Store', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        PAYMENTS_ENABLED: 'false',
        DEV_AUTH_BYPASS: 'true',
        ...FIREBASE_BASE,
        ...CLEARED,
      },
      () => {
        assert.equal(isDevMode(), false);
        assert.equal(issueNames().includes('DEV_AUTH_BYPASS'), true);
        assert.equal(validateProductionConfig(), false);
      }
    );
  });

  it('F) unconfigured providers report not configured without exposing secrets', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: undefined,
        REPLICATE_API_TOKEN: undefined,
        RUNWAY_API_KEY: undefined,
        ELEVENLABS_API_KEY: undefined,
      },
      () => {
        const status = getAiProviderStatus();
        assert.equal(status.openai.configured, false);
        assert.equal(status.replicate.configured, false);
        assert.equal(status.runway.configured, false);
        assert.equal(status.elevenlabs.configured, false);
        const serialized = JSON.stringify(status);
        assert.equal(serialized.includes('sk-'), false);
        assert.equal(serialized.includes('sk_live'), false);
        assert.equal(serialized.includes('BEGIN PRIVATE KEY'), false);
        assert.equal(serialized.includes('OPENAI_API_KEY'), false);
        const statusRoute = repo('backend/src/routes/status.routes.ts');
        assert.match(statusRoute, /getAiProviderStatus\(\)/);
        assert.match(statusRoute, /arePaymentsEnabled\(\)/);
        assert.doesNotMatch(statusRoute, /getStripeSecretKey/);
        assert.doesNotMatch(statusRoute, /getOpenAiApiKey\(\)/);
      }
    );
  });

  it('G) payments disabled block checkout with no Stripe or PayPal call', async () => {
    await withEnv({ PAYMENTS_ENABLED: 'false' }, async () => {
      assert.equal(arePaymentsEnabled(), false);
      await assert.rejects(assertNewPaymentsAllowed, isPaymentsDisabledError);
      await assert.rejects(
        () => createCheckoutSession('user-startup-gate', 'gate@test.local', 'starter'),
        isPaymentsDisabledError
      );
      await assert.rejects(() => createPayPalOrder('user-startup-gate', 'starter'), isPaymentsDisabledError);
    });
    const stripeService = repo('backend/src/services/stripe.service.ts');
    assert.ok(stripeService.indexOf('assertNewPaymentsAllowed') < stripeService.indexOf('checkout.sessions.create'));
    const index = repo('backend/src/index.ts');
    assert.match(index, /collectProductionConfigIssues/);
    assert.doesNotMatch(index, /isStripeConfigured\(\)/);
    assert.doesNotMatch(index, /hasImageAiProvider\(\)/);
    assert.equal(getFrontendUrls().some((url) => url.includes('creatorbrandingstudioultimate-production')), false);
    const conv = repo('backend/src/services/nexter/conversation.service.ts');
    assert.match(conv, /AI PROVIDER NOT CONFIGURED/);
    assert.match(conv, /if \(isProduction\(\)\)/);
  });
});
