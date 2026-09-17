import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  PRODUCT_FULL_NAME,
  PRODUCT_NAME,
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
import { inviteEmail, purchaseReceiptEmail, welcomeEmail } from './email.service.js';
import { previewWhiteLabel } from './white-label.service.js';
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

const LEGACY_PRODUCT =
  /\bUCBS\b|\bNexa\b|\bNexta\b|\bNextar\b|Ultimate Creator Branding Studio|(?<![A-Za-z])Creator Branding Studio/;

function assertNoLegacyProductBrand(label: string, text: string): void {
  const hit = text.match(LEGACY_PRODUCT);
  assert.equal(hit, null, `${label} still has legacy product brand: ${hit?.[0] ?? ''}`);
}

describe('Block I — NEXTER production branding / legacy cleanup', () => {
  const html = repo('frontend/index.html');
  const manifest = repo('frontend/public/manifest.webmanifest');
  const landing = repo('frontend/src/pages/landing/LandingPage.tsx');
  const login = repo('frontend/src/pages/auth/LoginPage.tsx');
  const authLayout = repo('frontend/src/components/layout/AuthLayout.tsx');
  const onboarding = repo('frontend/src/pages/onboarding/OnboardingPage.tsx');
  const dashboard = repo('frontend/src/v2/pages/DashboardV2Page.tsx');
  const nexterPage = repo('frontend/src/pages/nexter/NexterPage.tsx');
  const nexterPanel = repo('frontend/src/components/nexter/NexterPanel.tsx');
  const sidebarNav = repo('frontend/src/v2/layout/SidebarNav.tsx');
  const sidebar = repo('frontend/src/components/layout/Sidebar.tsx');
  const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
  const support = repo('frontend/src/pages/support/SupportPage.tsx');
  const admin = repo('frontend/src/pages/admin/AdminPage.tsx');
  const legalPage = repo('frontend/src/pages/legal/LegalPage.tsx');
  const legalService = src('services/legal.service.ts');
  const errorBoundary = repo('frontend/src/components/ErrorBoundary.tsx');
  const oauthComplete = repo('frontend/src/pages/auth/OAuthCompletePage.tsx');
  const pwaTheme = repo('frontend/src/lib/pwa-theme.ts');
  const pwaBanner = repo('frontend/src/components/pwa/PwaInstallBanner.tsx');
  const email = src('services/email.service.ts');
  const paypal = src('services/paypal.service.ts');
  const stripe = src('services/stripe.service.ts');
  const mobile = src('services/mobile.service.ts');
  const whiteLabel = src('services/white-label.service.ts');
  const providers = src('lib/media-providers.ts');
  const projectExport = src('services/project-export.service.ts');
  const oauth = src('services/oauth.service.ts');
  const authErrors = repo('frontend/src/lib/auth-errors.ts');
  const invite = src('services/invite.service.ts');
  const branding = repo('shared/src/branding.ts');

  it('1-5. landing, login, registration, onboarding, dashboard use NEXTER', () => {
    assert.equal(PRODUCT_NAME, 'NEXTER');
    assert.equal(PRODUCT_FULL_NAME, 'NEXTER Creator Studio');
    assert.match(branding, /PRODUCT_NAME = 'NEXTER'/);
    assert.match(landing, /NEXTER Creator Studio/);
    assert.match(landing, />NEXTER</);
    assert.match(authLayout, />NEXTER</);
    assert.match(authLayout, /NEXTER Creator Studio/);
    assert.match(login, /Willkommen zurück bei NEXTER/);
    assert.match(login, /Konto bei NEXTER erstellen/);
    assert.match(onboarding, /Willkommen bei NEXTER/);
    assert.match(dashboard, /in NEXTER/);
    assert.match(sidebarNav, />NEXTER</);
    assert.match(sidebar, />NEXTER</);
    assert.match(sidebar, /Creator Studio/);
    assertNoLegacyProductBrand('landing', landing);
    assertNoLegacyProductBrand('login', login);
    assertNoLegacyProductBrand('authLayout', authLayout);
    assertNoLegacyProductBrand('onboarding', onboarding);
    assertNoLegacyProductBrand('dashboard', dashboard);
    assertNoLegacyProductBrand('sidebar', sidebar);
    assertNoLegacyProductBrand('sidebarNav', sidebarNav);
  });

  it('6-10. chat, settings, footer, 404, error fallback use NEXTER', () => {
    assert.match(nexterPage, />NEXTER</);
    assert.match(nexterPanel, /Frag Nexter/);
    assert.doesNotMatch(nexterPage, /\bNexa\b|\bNexta\b|\bNextar\b/);
    assert.doesNotMatch(nexterPanel, /\bNexa\b|\bNexta\b|\bNextar\b/);
    assert.match(settings, /NEXTER/);
    assert.match(authLayout, /© \{year\} NEXTER Creator Studio/);
    assert.match(landing, /© \{new Date\(\)\.getFullYear\(\)\} NEXTER Creator Studio/);
    assert.match(legalPage, /Seite nicht gefunden — NEXTER Creator Studio/);
    assert.match(errorBoundary, /Etwas ist schiefgelaufen — NEXTER/);
    assertNoLegacyProductBrand('settings', settings);
    assertNoLegacyProductBrand('support', support);
    assertNoLegacyProductBrand('errorBoundary', errorBoundary);
    assertNoLegacyProductBrand('legalPage', legalPage);
  });

  it('11-15. browser title, HTML metadata, PWA name/short_name have no UCBS/Nexa', () => {
    assert.match(html, /<title>NEXTER Creator Studio<\/title>/);
    assert.match(html, /meta name="application-name" content="NEXTER Creator Studio"/);
    assert.match(html, /property="og:title" content="NEXTER Creator Studio"/);
    assert.match(html, /property="og:site_name" content="NEXTER Creator Studio"/);
    assert.match(html, /name="twitter:title" content="NEXTER Creator Studio"/);
    assert.match(html, /apple-mobile-web-app-title" content="NEXTER"/);
    assert.doesNotMatch(html, /canonical[^>]+creatorbrandingstudioultimate/);
    assert.match(manifest, /"name": "NEXTER Creator Studio"/);
    assert.match(manifest, /"short_name": "NEXTER"/);
    assert.match(pwaTheme, /PRODUCT_NAME/);
    assert.doesNotMatch(pwaTheme, /– UCBS/);
    assert.match(pwaBanner, /NEXTER als App installieren/);
    assert.match(mobile, /shortName: PRODUCT_NAME/);
    assert.match(mobile, /NEXTER Creator Studio — KI-Web-App/);
    assertNoLegacyProductBrand('index.html', html);
    assertNoLegacyProductBrand('manifest', manifest);
    assertNoLegacyProductBrand('pwa-theme', pwaTheme);
    assertNoLegacyProductBrand('pwa-banner', pwaBanner);
    assertNoLegacyProductBrand('mobile.service', mobile);
  });

  it('16-18. invite, welcome, and payment receipt templates use NEXTER', () => {
    const welcome = welcomeEmail('a@test.invalid', 'Ada', 50);
    const inviteMail = inviteEmail('a@test.invalid', 'CODE', 'Beta');
    const receipt = purchaseReceiptEmail('a@test.invalid', 'Ada', 'Starter', 100);
    assert.match(welcome.subject, /NEXTER Creator Studio/);
    assert.match(welcome.text, /NEXTER/);
    assert.match(inviteMail.subject, /NEXTER/);
    assert.match(inviteMail.text, /NEXTER Creator Studio/);
    assert.match(receipt.subject, /NEXTER:/);
    assert.match(receipt.text, /— NEXTER/);
    assertNoLegacyProductBrand('email.service', email);
    assertNoLegacyProductBrand('welcome subject', welcome.subject);
    assertNoLegacyProductBrand('invite subject', inviteMail.subject);
    assertNoLegacyProductBrand('receipt subject', receipt.subject);
  });

  it('19-20. OAuth UI has no GitHub/Apple regression and callback copy uses NEXTER', () => {
    assert.deepEqual(
      [...AUTH_PROVIDER_IDS].sort(),
      ['discord', 'email', 'google', 'microsoft', 'tiktok', 'twitch'].sort()
    );
    assert.match(login, /id: 'google'/);
    assert.match(login, /id: 'discord'/);
    assert.match(login, /id: 'twitch'/);
    assert.match(login, /id: 'tiktok'/);
    assert.match(login, /id: 'microsoft'/);
    assert.doesNotMatch(login, /github|apple|GitHub|Apple/i);
    assert.doesNotMatch(oauthComplete, /github|apple|GitHub|Apple/i);
    assert.match(oauthComplete, /NEXTER-Anmeldung wird abgeschlossen/);
    assert.match(oauthComplete, /NEXTER ist derzeit nur mit Einladung zugänglich/);
    assert.match(invite, /NEXTER ist derzeit nur mit Einladung zugänglich/);
    assert.match(authErrors, /NEXTER ist derzeit nur mit Einladung zugänglich/);
    assertNoLegacyProductBrand('oauth complete', oauthComplete);
  });

  it('21-23. legal, support/feedback, and admin headers use NEXTER', () => {
    assert.match(legalService, /NEXTER Creator Studio/);
    assert.match(support, /NEXTER Support & Feedback/);
    assert.match(admin, /NEXTER Admin/);
    assertNoLegacyProductBrand('legal.service', legalService);
    assertNoLegacyProductBrand('admin', admin);
  });

  it('24-27. new export names, old Railway links, denylist, and Firebase project', () => {
    assert.match(providers, /PRODUCT_NAME\} Track/);
    assert.doesNotMatch(providers, /UCBS Track/);
    assert.doesNotMatch(projectExport, /ucbs-/i);
    assert.doesNotMatch(landing, /creatorbrandingstudioultimate-production\.up\.railway\.app/);
    assert.doesNotMatch(html, /creatorbrandingstudioultimate-production\.up\.railway\.app/);
    assert.doesNotMatch(login, /creatorbrandingstudioultimate-production\.up\.railway\.app/);
    assert.match(oauth, /creatorbrandingstudioultimate-production\.up\.railway\.app/);
    assert.match(oauth, /nexter-creator-studio-production\.up\.railway\.app/);
    assert.match(authErrors, /RETIRED_UCBS_HOST/);
    assert.match(authErrors, /creatorbrandingstudioultimate/);
    const firebaseAlign = src('services/firebase-alignment.test.ts');
    const retiredFirebaseProject = ['creatorstudio', '519eb'].join('-');
    assert.equal(firebaseAlign.includes(retiredFirebaseProject), true);
    assert.match(firebaseAlign, /zero active creatorstudio/);
    assert.match(paypal, /brand_name: PRODUCT_NAME/);
    assert.doesNotMatch(stripe, /\bUCBS\b|\bNexa\b|Ultimate Creator Branding Studio/);
    const preview = previewWhiteLabel({});
    assert.equal(preview.platformName, 'NEXTER Creator Studio');
    assertNoLegacyProductBrand('white-label.service', whiteLabel);
    assertNoLegacyProductBrand('paypal.service', paypal);
  });

  it('28-33. no active user-facing Nexa/Nexta/Nextar/UCBS/old product titles', () => {
    const surfaces = [
      ['landing', landing],
      ['login', login],
      ['onboarding', onboarding],
      ['dashboard', dashboard],
      ['nexter page', nexterPage],
      ['settings', settings],
      ['support', support],
      ['admin', admin],
      ['index.html', html],
      ['manifest', manifest],
      ['legal pages', legalPage],
      ['error boundary', errorBoundary],
      ['email', email],
      ['mobile', mobile],
    ] as const;
    for (const [label, text] of surfaces) {
      assertNoLegacyProductBrand(label, text);
    }
  });

  it('34-37. pricing, welcome bonus, browser TTS, and payments stay frozen', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(Object.values(COIN_COSTS).includes(135), false);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isTtsGenerationEnabled(), false);
    const tts = repo('shared/src/nexter-tts.ts');
    assert.doesNotMatch(tts, /withCoinCharge/);
    assert.match(nexterPanel, /speakBrowserUtterance/);
    assert.match(nexterPanel, /createNexterTtsController/);
  });

  it('38-46. closed launch blocks stay in the regression suite', () => {
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
    assert.match(src('services/nexter-tts-e2e.test.ts'), /TTS_GENERATION_ENABLED/);
    assert.match(repo('frontend/src/lib/logo-favorites-storage.ts'), /ucbs-logo-favorites/);
    assert.match(repo('shared/src/magik/logo-studio-mode.ts'), /ucbs-logo-studio-mode/);
    assert.match(pwaBanner, /ucbs_pwa_banner_dismissed/);
    assert.match(repo('package.json'), /"name": "ultimate-creator-branding-studio"/);
    assert.match(repo('shared/package.json'), /"name": "@ucbs\/shared"/);
  });
});
