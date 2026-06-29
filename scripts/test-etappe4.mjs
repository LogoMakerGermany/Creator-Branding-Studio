#!/usr/bin/env node
/** Etappe 4 — Payments static checks. Run: node scripts/test-etappe4.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(l) { passed++; console.log(`  ✓ ${l}`); }
function fail(l, d) { failed++; console.error(`  ✗ ${l}${d ? `: ${d}` : ''}`); }
function read(r) { return readFileSync(join(root, r), 'utf8'); }
function inc(r, n, l) { read(r).includes(n) ? ok(l) : fail(l, n); }
function exc(r, n, l) { !read(r).includes(n) ? ok(l) : fail(l, n); }

console.log('\n=== Etappe 4 Payments — Static Tests ===\n');

console.log('Shared packages');
inc('shared/src/coin-packages.ts', 'COIN_PACKAGE_DEFINITIONS', 'shared coin packages');
inc('backend/src/services/coins.service.ts', 'COIN_PACKAGE_DEFINITIONS', 'backend uses shared packages');
console.log('');

console.log('Stripe');
inc('backend/src/routes/stripe.routes.ts', 'checkout.session.async_payment_succeeded', 'async payment webhook');
inc('backend/src/index.ts', 'express.raw', 'stripe raw webhook body');
inc('backend/src/services/session-store.service.ts', 'processedStripeSessions', 'stripe idempotency store');
exc('backend/src/routes/stripe.routes.ts', 'buildFallback', 'no stripe fallback');
console.log('');

console.log('PayPal');
inc('backend/src/services/paypal.service.ts', 'verifyPayPalWebhookEvent', 'paypal webhook verification');
inc('backend/src/routes/paypal.routes.ts', 'verifyPayPalWebhookEvent', 'paypal route verifies webhook');
exc('backend/src/services/paypal.service.ts', "startsWith('A')", 'no client-id live heuristic');
inc('backend/src/config/startup-validation.ts', 'PAYPAL_WEBHOOK_ID', 'paypal webhook required in prod');
console.log('');

console.log('Coins & credit');
inc('backend/src/services/payment-credit.service.ts', 'stripeSessionId', 'payment metadata on credit');
inc('backend/src/services/payment-credit.service.ts', 'AMOUNT_MISMATCH', 'amount validation');
inc('frontend/src/pages/coins/CoinsPage.tsx', 'devPurchaseAllowed', 'dev purchase guard in UI');
console.log('');

console.log('Dev guards');
inc('backend/src/routes/stripe.routes.ts', 'Dev-Kauf ist in Production deaktiviert', 'stripe dev guard');
inc('backend/src/routes/paypal.routes.ts', 'Dev-Kauf ist in Production deaktiviert', 'paypal dev guard');
console.log('');

console.log(`--- Result: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
