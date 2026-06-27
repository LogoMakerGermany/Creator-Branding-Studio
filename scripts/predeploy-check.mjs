#!/usr/bin/env node
/**
 * Pre-deploy checklist — run before Railway/Firebase deploy.
 * Usage: node scripts/predeploy-check.mjs
 * With local env: node --env-file=backend/.env scripts/predeploy-check.mjs
 */

const required = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_STORAGE_BUCKET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const publicRequired = [
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_PROJECT_ID',
];

const aiAny = ['OPENAI_API_KEY', 'REPLICATE_API_TOKEN'];

function ok(key) {
  return Boolean(process.env[key]?.trim());
}

const errors = [];
const warnings = [];

if (process.env.DEV_AUTH_BYPASS === 'true') {
  errors.push('DEV_AUTH_BYPASS must not be set in production');
}

for (const key of required) {
  if (!ok(key)) errors.push(`Missing ${key}`);
}

if (!ok('FRONTEND_URL') && !ok('FRONTEND_URLS')) {
  errors.push('Missing FRONTEND_URL or FRONTEND_URLS');
}

const serveStatic = process.env.SERVE_STATIC !== 'false';
if (serveStatic) {
  for (const key of publicRequired) {
    if (!ok(key)) errors.push(`Missing ${key} (required for SERVE_STATIC=true)`);
  }
}

if (!aiAny.some(ok)) {
  errors.push(`At least one AI key required: ${aiAny.join(' or ')}`);
}

if (!ok('STRIPE_PRICE_STARTER')) {
  warnings.push('STRIPE_PRICE_STARTER not set — coin checkout may fail');
}

if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  warnings.push('STRIPE_SECRET_KEY is test mode — use sk_live_ for production');
}

if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_MODE !== 'live') {
  warnings.push('PayPal is in sandbox mode — set PAYPAL_MODE=live for production');
}

console.log('UCBS Pre-Deploy Check\n');

if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  console.log('');
}

if (errors.length) {
  console.log('Blocked:');
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  console.log('\nSee docs/RAILWAY-DEPLOY.md and backend/.env.example');
  process.exit(1);
}

console.log('✓ All required production variables are set.');
console.log('Next: push to GitHub → connect Railway → deploy Firebase rules');
