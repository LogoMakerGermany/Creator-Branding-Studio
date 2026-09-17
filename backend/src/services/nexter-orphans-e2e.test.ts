import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  NEXTER_STUDIO_PATHS,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
} from '@ucbs/shared';
import {
  arePaymentsEnabled,
  getDefaultFreeCoins,
  isOpenAiImageGenerationLiveEnabled,
  isTtsGenerationEnabled,
} from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import {
  ACTIVE_APP_PATHS,
  LEGACY_REDIRECTS,
  LEGACY_UNAVAILABLE_PATHS,
} from '../../../frontend/src/routes/legacy-surfaces.ts';
import { PRIMARY_NAV, BRANDING_MODULES, AI_CREATOR_MODULES, SETTINGS_LINKS } from '../../../frontend/src/v2/config/navigation.ts';
import { AUTH_PROVIDER_IDS } from '../../../frontend/src/lib/auth-providers.ts';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function src(rel: string): string {
  return readFileSync(join(dir, '..', rel), 'utf8');
}

const ACTIVE = new Set<string>(ACTIVE_APP_PATHS);
const REDIRECT_FROM = new Set(Object.keys(LEGACY_REDIRECTS));
const UNAVAILABLE = new Set<string>(LEGACY_UNAVAILABLE_PATHS);

function assertActive(path: string, label: string): void {
  const clean = path.split('?')[0] ?? path;
  assert.equal(ACTIVE.has(clean), true, `${label} path ${path} is not an active app route`);
  assert.equal(REDIRECT_FROM.has(clean), false, `${label} path ${path} is a legacy redirect`);
  assert.equal(UNAVAILABLE.has(clean), false, `${label} path ${path} is marked unavailable`);
}

describe('Block M — V1 orphan surfaces / legacy routes', () => {
  const routes = repo('frontend/src/routes/index.tsx');
  const sidebar = repo('frontend/src/v2/layout/SidebarNav.tsx');
  const topBar = repo('frontend/src/v2/layout/TopBar.tsx');
  const dashboard = repo('frontend/src/v2/pages/DashboardV2Page.tsx');
  const pwaBanner = repo('frontend/src/components/pwa/PwaInstallBanner.tsx');
  const manifest = repo('frontend/public/manifest.webmanifest');
  const sw = repo('frontend/public/sw.js');
  const errorBoundary = repo('frontend/src/components/ErrorBoundary.tsx');
  const oauthComplete = repo('frontend/src/pages/auth/OAuthCompletePage.tsx');
  const login = repo('frontend/src/pages/auth/LoginPage.tsx');
  const legalPage = repo('frontend/src/pages/legal/LegalPage.tsx');
  const notFound = repo('frontend/src/pages/system/NotFoundPage.tsx');
  const unavailable = repo('frontend/src/pages/system/LegacyUnavailablePage.tsx');
  const tools = src('services/nexter/tools.service.ts');
  const v1Legacy = src('middleware/v1-legacy.ts');
  const oauth = src('services/oauth.service.ts');
  const authErrors = repo('frontend/src/lib/auth-errors.ts');

  it('1-4. sidebar, dashboard CTAs, mobile nav, and NEXTER mappings resolve to active routes', () => {
    for (const item of PRIMARY_NAV) assertActive(item.path, `sidebar ${item.id}`);
    assert.match(sidebar, /PRIMARY_NAV/);
    const dashboardCtas = [
      '/logo-studio',
      '/streamset-studio',
      '/facecam-studio',
      '/banner-studio',
      '/sticker-studio',
      '/video-studio',
      '/layout-studio',
      '/social-studio',
    ];
    for (const path of dashboardCtas) {
      assert.match(dashboard, new RegExp(`path: '${path}'`));
      assertActive(path, `dashboard CTA ${path}`);
    }
    assert.match(sidebar, /mobileNavOpen/);
    for (const [, path] of Object.entries(NEXTER_STUDIO_PATHS)) {
      assertActive(path, `NEXTER mapping ${path}`);
    }
    assert.match(tools, /NEXTER_STUDIO_PATHS/);
    assert.doesNotMatch(tools, /\/marketplace|\/team-dna|\/ai-assistant|\/ultimate-creator/);
  });

  it('5-18. current studio, library, settings, and support routes stay mounted', () => {
    for (const path of [
      '/logo-studio',
      '/facecam-studio',
      '/overlay-studio',
      '/streamset-studio',
      '/banner-studio',
      '/sticker-studio',
      '/animation-studio',
      '/ai-video',
      '/ai-music',
      '/ai-voice',
      '/projects',
      '/file-cloud',
      '/settings',
      '/support',
    ]) {
      assert.match(routes, new RegExp(`path="${path}"`));
      assertActive(path, path);
    }
    for (const mod of [...BRANDING_MODULES, ...AI_CREATOR_MODULES, ...SETTINGS_LINKS]) {
      assertActive(mod.path, `hub ${mod.id}`);
    }
  });

  it('19-25. admin RBAC, legal, login, invite, verification, reset, and OAuth callbacks stay', () => {
    assert.match(routes, /AdminRoute/);
    assert.match(routes, /path="\/admin"/);
    assert.match(routes, /path="\/legal\/:slug"/);
    assert.match(legalPage, /LEGAL_PUBLIC_SLUGS/);
    assert.match(routes, /path="\/login"/);
    assert.match(login, /inviteRequired|Einladung/);
    assert.match(routes, /path="\/verify-email"/);
    assert.match(login, /Passwort zurücksetzen/);
    assert.match(routes, /path="\/login\/oauth\/complete"/);
    assert.match(oauthComplete, /completeOAuth/);
    assert.deepEqual(
      [...AUTH_PROVIDER_IDS].sort(),
      ['discord', 'email', 'google', 'microsoft', 'tiktok', 'twitch'].sort()
    );
    assert.match(v1Legacy, /blockLegacyV1/);
    assert.match(v1Legacy, /FEATURE_NOT_AVAILABLE/);
  });

  it('26-31. unknown routes 404, orphans do not render dead UI, redirects are single-hop, nav stays clean', () => {
    assert.match(routes, /path="\*"/);
    assert.match(routes, /NotFoundPage/);
    assert.doesNotMatch(routes, /path="\*" element=\{<Navigate to="\/"/);
    assert.match(notFound, /Seite nicht gefunden — NEXTER/);
    assert.match(unavailable, /nicht verfügbar/);
    assert.doesNotMatch(routes, /MarketplacePage|TeamDNAPage|TeamChatPage|VTuberStudioPage|BrandingGeneratorPage|AIImagePage|UltimateCreatorPage|ExportCenterPage|ModulePage|MobileAppPage/);
    assert.match(routes, /LEGACY_REDIRECTS/);
    assert.match(routes, /PROTECTED_UNAVAILABLE|LEGACY_UNAVAILABLE_PATHS/);
    for (const [, to] of Object.entries(LEGACY_REDIRECTS)) {
      assertActive(to, `redirect target ${to}`);
      assert.equal(REDIRECT_FROM.has(to), false, `redirect chain to ${to}`);
    }
    for (const path of LEGACY_UNAVAILABLE_PATHS) {
      assert.doesNotMatch(sidebar, new RegExp(path.replace(/\//g, '\\/')));
    }
    assert.doesNotMatch(topBar, /\/ultimate-creator|\/export-center/);
    assert.doesNotMatch(pwaBanner, /\/mobile-app/);
    assert.match(pwaBanner, /to="\/settings"/);
    assert.match(errorBoundary, /href="\/"|href=\{\`\/support/);
    assert.doesNotMatch(errorBoundary, /\/marketplace|\/ai-assistant|\/ultimate-creator/);
  });

  it('32-40. unrouted legacy pages cannot quote-bypass, pay, or show production mocks', () => {
    const image = repo('frontend/src/pages/ai/AIImagePage.tsx');
    const branding = repo('frontend/src/pages/branding/BrandingGeneratorPage.tsx');
    const ultimate = repo('frontend/src/pages/ultimate/UltimateCreatorPage.tsx');
    const marketplace = repo('frontend/src/pages/marketplace/MarketplacePage.tsx');
    assert.equal(image.includes('api.ai.generate'), false);
    assert.equal(branding.includes('generateBrandingPack'), false);
    assert.equal(ultimate.includes('ultimateCreator.create'), false);
    assert.match(image, /Nexter nach Bestätigung/);
    assert.match(branding, /Nexter nach Bestätigung/);
    assert.equal(arePaymentsEnabled(), false);
    assert.doesNotMatch(marketplace, /sk_live|checkout\.sessions/);
    assert.doesNotMatch(dashboard, /coinBalance:\s*99999|fakeBalance|demoUser|mockJobs/);
    assert.match(dashboard, /ohne Demo-Daten/);
  });

  it('41-52. pricing freeze, TTS, denylist, and inactive legacy infra', () => {
    assert.equal(Object.values(COIN_COSTS).includes(135), false);
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(isTtsGenerationEnabled(), false);
    const tts = repo('shared/src/nexter-tts.ts');
    assert.doesNotMatch(tts, /withCoinCharge/);
    assert.match(oauth, /creatorbrandingstudioultimate-production/);
    assert.match(authErrors, /RETIRED_UCBS_HOST/);
    const firebaseAlign = src('services/firebase-alignment.test.ts');
    const retiredProject = ['creatorstudio', '519eb'].join('-');
    assert.equal(firebaseAlign.includes(retiredProject), true);
    assert.doesNotMatch(repo('frontend/index.html'), /creatorbrandingstudioultimate-production/);
    assert.match(manifest, /"start_url": "\/dashboard"/);
    assert.match(manifest, /"url": "\/coins"/);
    assert.match(sw, /ucbs-shell-v4/);
    assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
  });

  it('53-62. closed launch blocks stay in the regression suite', () => {
    assert.equal(isOpenAiImageGenerationLiveEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.match(src('services/image-generation-e2e.test.ts'), /quote|confirm/i);
    assert.match(src('services/video-quote-e2e.test.ts'), /quote/i);
    assert.match(src('services/music-quote-e2e.test.ts'), /quote/i);
    assert.match(src('services/legal-operator-e2e.test.ts'), /LEGAL_TEXT_STATUS/);
    assert.match(src('services/oauth-invite-e2e.test.ts'), /invite/);
    assert.match(src('services/email-production-e2e.test.ts'), /UNAVAILABLE|fail-closed|TRANSACTIONAL/i);
    assert.match(src('services/storage-lifecycle-e2e.test.ts'), /deletedAt|soft/i);
    assert.match(src('services/firestore-id-nan-e2e.test.ts'), /empty|NaN|invalid/i);
    assert.match(src('services/nexter-branding-e2e.test.ts'), /PRODUCT_NAME/);
    assert.match(src('services/nexter-tts-e2e.test.ts'), /TTS_GENERATION_ENABLED/);
    assert.match(repo('frontend/src/lib/logo-favorites-storage.ts'), /ucbs-logo-favorites/);
  });
});
