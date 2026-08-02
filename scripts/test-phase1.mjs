#!/usr/bin/env node
/** Phase 1–4 static checks. Run: node scripts/test-phase1.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(l) {
  passed++;
  console.log(`  ✓ ${l}`);
}
function fail(l, d) {
  failed++;
  console.error(`  ✗ ${l}${d ? `: ${d}` : ''}`);
}
function read(r) {
  return readFileSync(join(root, r), 'utf8');
}
function inc(r, n, l) {
  read(r).includes(n) ? ok(l) : fail(l, n);
}
function exc(r, n, l) {
  !read(r).includes(n) ? ok(l) : fail(l, `still contains ${n}`);
}

console.log('\n=== Phase 1–4 Production Foundation — Static Tests ===\n');

console.log('Phase 1 — Registration / Roles / Invites');
inc('shared/src/roles.ts', "USER = 'user'", 'USER role');
inc('shared/src/roles.ts', "TESTER = 'tester'", 'TESTER role');
inc('shared/src/registration.ts', 'invite_only', 'registration modes');
inc('backend/src/config/env.ts', 'getRegistrationModeEnv', 'REGISTRATION_MODE env');
inc('backend/src/services/invite.service.ts', 'redeemInviteCode', 'invite redeem');
inc('backend/src/services/system-settings.service.ts', 'registrationMode', 'system settings');
inc('backend/src/routes/auth.routes.ts', 'authenticateAllowUnprovisioned', 'sync without profile');
inc('backend/src/routes/auth.routes.ts', 'inviteCode', 'invite on sync');
inc('backend/src/routes/admin.routes.ts', '/invites', 'admin invites API');
inc('backend/src/middleware/auth.ts', 'AUTH_REQUIRED', 'auth error code');
inc('frontend/src/pages/auth/LoginPage.tsx', 'Einladungscode', 'invite UI');
inc('frontend/src/lib/firebase.ts', 'sendPasswordResetEmail', 'password reset');
inc('frontend/src/lib/firebase.ts', 'sendEmailVerification', 'email verification');
inc('backend/src/services/user.service.ts', 'UserRole.USER', 'default USER role');

console.log('\nPhase 3 — Pricing / Ledger / Stripe quotes');
inc('shared/src/pricing.ts', 'PriceComponent', 'price component type');
inc('shared/src/ledger.ts', 'ADMIN_TEST_CREDIT', 'ledger types');
inc('backend/src/services/pricing.service.ts', 'createPriceQuote', 'quote service');
inc('backend/src/services/pricing.service.ts', 'calculateOrderPrice', 'server price calc');
inc('backend/src/services/ledger.service.ts', 'appendLedgerEntry', 'ledger append');
inc('backend/src/services/ledger.service.ts', 'idempotencyKey', 'ledger idempotency');
inc('backend/src/routes/pricing.routes.ts', "/quote", 'quote route');
inc('backend/src/services/stripe.service.ts', 'createQuoteCheckoutSession', 'exact stripe checkout');
inc('backend/src/routes/stripe.routes.ts', 'order_quote', 'stripe quote webhook path');
inc('backend/.env.example', 'REGISTRATION_MODE', 'env docs registration');
inc('backend/.env.example', 'PRICE_QUOTE_TTL_MINUTES', 'env docs quote ttl');

console.log('\nPhase 4 — Storage privacy');
exc('backend/src/lib/firebase-storage.ts', 'makePublic()', 'no makePublic');
inc('backend/src/lib/firebase-storage.ts', 'getSignedUrl', 'signed URLs');
inc('backend/src/lib/firebase-storage.ts', 'public: false', 'private uploads');

console.log('\nDefer non-core nav');
exc('frontend/src/v2/config/navigation.ts', "id: 'marketplace'", 'marketplace removed from primary nav');
exc('frontend/src/v2/config/navigation.ts', "id: 'vtuber'", 'vtuber removed from branding modules');
inc('frontend/src/v2/config/navigation.ts', "label: 'Guthaben'", 'guthaben in primary nav');
inc('frontend/src/routes/index.tsx', 'path="/marketplace"', 'marketplace redirect present');

console.log(`\n--- Result: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
