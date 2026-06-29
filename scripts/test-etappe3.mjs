#!/usr/bin/env node
/** Etappe 3 — Auth static checks. Run: node scripts/test-etappe3.mjs */
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

console.log('\n=== Etappe 3 Auth — Static Tests ===\n');

inc('shared/src/user.ts', "'github'", 'github auth provider type');
inc('shared/src/user.ts', "'microsoft'", 'microsoft auth provider type');
inc('frontend/src/lib/firebase.ts', 'GithubAuthProvider', 'GitHub Firebase provider');
inc('frontend/src/lib/firebase.ts', "OAuthProvider('apple.com')", 'Apple OAuth');
inc('frontend/src/lib/firebase.ts', "OAuthProvider('microsoft.com')", 'Microsoft OAuth');
inc('frontend/src/lib/auth-providers.ts', 'resolveAuthProvider', 'provider resolver');
inc('frontend/src/pages/auth/LoginPage.tsx', "'github'", 'GitHub login button');
inc('frontend/src/context/AuthContext.tsx', 'resolveAuthProvider', 'sync with provider id');
inc('backend/src/routes/auth.routes.ts', "'github'", 'backend provider validation');
exc('backend/src/routes/auth.routes.ts', "authProvider: 'firebase'", 'no generic firebase provider');
inc('docs/ETAPPE3-AUTH-SETUP.md', 'oidc.discord', 'OIDC setup docs');
inc('scripts/sync-firebase-env.mjs', 'apps:sdkconfig', 'firebase env sync script');

console.log(`\n--- Result: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
