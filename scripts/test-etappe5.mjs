#!/usr/bin/env node
/** Etappe 5 — Marketplace static checks. Run: node scripts/test-etappe5.mjs */
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

console.log('\n=== Etappe 5 Marketplace — Static Tests ===\n');

console.log('Backend service');
inc('backend/src/services/marketplace.service.ts', 'seedMarketplaceDev', 'dev-only seed function');
inc('backend/src/services/marketplace.service.ts', 'isProduction()', 'production guard on seed');
exc('backend/src/services/marketplace.service.ts', 'placeholderSvg', 'no placeholderSvg helper');
inc('backend/src/services/marketplace.service.ts', 'uploadAssetFromDataUrl', 'firebase storage upload');
inc('backend/src/services/marketplace.service.ts', 'previewDataUrl', 'requires preview data url');
inc('backend/src/services/marketplace.service.ts', 'assetDataUrl', 'requires asset data url');
inc('backend/src/services/marketplace.service.ts', 'filterPublicItems', 'filters system listings in prod');
inc('backend/src/services/marketplace.service.ts', 'deactivateListing', 'seller can deactivate');
console.log('');

console.log('Routes');
inc('backend/src/routes/marketplace.routes.ts', 'previewDataUrl', 'route validates preview upload');
inc('backend/src/routes/marketplace.routes.ts', 'assetDataUrl', 'route validates asset upload');
inc('backend/src/routes/marketplace.routes.ts', 'mapMarketplaceError', 'service errors mapped');
exc('backend/src/routes/marketplace.routes.ts', 'previewUrl', 'no optional previewUrl in schema');
console.log('');

console.log('Frontend');
inc('frontend/src/pages/marketplace/MarketplacePage.tsx', 'previewDataUrl', 'sell form sends preview');
inc('frontend/src/pages/marketplace/MarketplacePage.tsx', 'assetDataUrl', 'sell form sends asset');
inc('frontend/src/pages/marketplace/MarketplacePage.tsx', 'deactivateListing', 'deactivate listing UI');
inc('frontend/src/services/api.ts', 'previewDataUrl', 'api type requires preview');
exc('frontend/src/services/api.ts', 'previewUrl?:', 'no optional previewUrl in api type');
console.log('');

console.log(`--- Result: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
