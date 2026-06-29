#!/usr/bin/env node
/**
 * Etappe 1 — Branding module smoke checks (static verification).
 * Run: node scripts/test-etappe1.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  failed++;
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function mustInclude(rel, needle, label) {
  const content = read(rel);
  if (content.includes(needle)) ok(label);
  else fail(label, `missing "${needle}" in ${rel}`);
}

function mustNotInclude(rel, needle, label) {
  const content = read(rel);
  if (!content.includes(needle)) ok(label);
  else fail(label, `still contains "${needle}" in ${rel}`);
}

function mustExist(rel, label) {
  if (existsSync(join(root, rel))) ok(label);
  else fail(label, `file missing: ${rel}`);
}

console.log('\n=== Etappe 1 Branding — Static Tests ===\n');

const modules = [
  { key: 'logo', page: 'frontend/src/pages/studios/LogoStudioPage.tsx', route: '/logo-studio' },
  { key: 'banner', page: 'frontend/src/pages/studios/index.tsx', route: '/banner-studio' },
  { key: 'facecam', page: 'frontend/src/pages/studios/index.tsx', route: '/facecam-studio' },
  { key: 'overlay', page: 'frontend/src/pages/studios/OverlayStudioPage.tsx', route: '/overlay-studio' },
  { key: 'sticker', page: 'frontend/src/pages/studios/StickerStudioPage.tsx', route: '/sticker-studio' },
];

for (const mod of modules) {
  console.log(`Module: ${mod.key}`);
  mustExist(`backend/src/routes/studio.routes.ts`, `${mod.key} backend routes file`);
  mustInclude('backend/src/routes/studio.routes.ts', mod.key, `${mod.key} in studio.routes`);
  mustInclude('backend/src/routes/index.ts', `/${mod.key}`, `${mod.key} API mount`);
  mustInclude('frontend/src/routes/index.tsx', mod.route, `${mod.key} frontend route`);
  if (mod.key === 'logo' || mod.key === 'overlay' || mod.key === 'sticker') {
    mustInclude(mod.page, 'useStudioProjects', `${mod.key} project history hook`);
    mustInclude(mod.page, 'StudioHistory', `${mod.key} history UI`);
  }
  if (mod.key === 'banner' || mod.key === 'facecam') {
    mustInclude('frontend/src/pages/studios/StudioPage.tsx', 'useStudioProjects', `${mod.key} shared studio history`);
  }
  console.log('');
}

console.log('DNA & Branding Pack');
mustInclude('backend/src/services/dna-analysis.service.ts', 'gpt-4o-mini', 'OpenAI Vision model');
mustInclude('frontend/src/pages/creator-dna/CreatorDNAPage.tsx', 'api.dna.analyze(extracted, style, dataUrl)', 'DNA Vision upload');
mustInclude('frontend/src/pages/branding/BrandingGeneratorPage.tsx', 'partial', 'Branding pack partial status');
mustInclude('backend/src/routes/auth.routes.ts', 'buildBrandingModulePrompt', 'Branding pack prompts');
console.log('');

console.log('Mock cleanup');
mustNotInclude('backend/src/services/ai.service.ts', 'dev-placeholder', 'no dev-placeholder in ai.service');
mustNotInclude('backend/src/services/media.service.ts', 'generateDevPlaceholderSvg', 'dev placeholder removed');
console.log('');

console.log(`--- Result: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
