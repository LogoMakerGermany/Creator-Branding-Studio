import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  LEGAL_DOCUMENT_VERSIONS,
  LEGAL_LAST_UPDATED,
  LEGAL_OPERATOR,
  LEGAL_PLACEHOLDER,
  LEGAL_PRIVACY_VERSION,
  LEGAL_PUBLIC_SLUGS,
  LEGAL_REACCEPTANCE_REQUIRED,
  LEGAL_TERMS_VERSION,
  LEGAL_TEXT_STATUS,
  currentDraftLegalAcceptanceInput,
  evaluateLegalPublishGate,
  hasActiveLegalPlaceholderToken,
  missingLegalOperatorFields,
  shouldForceLegalReacceptance,
  type LegalOperatorField,
} from '@ucbs/shared';
import { isPathAllowedForGate } from '../../../frontend/src/lib/auth-gates.ts';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { getLegalPage, listLegalSlugs } from './legal.service.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

const COMPLETE_OPERATOR: Record<LegalOperatorField, string> = {
  operatorName: 'TEST_OPERATOR_COMPLETE',
  companyName: 'TEST_COMPANY_COMPLETE',
  legalForm: 'TEST_LEGAL_FORM',
  street: 'TEST_STREET_1',
  postalCode: '00000',
  city: 'TEST_CITY',
  country: 'TEST_COUNTRY',
  contactEmail: 'operator@test.invalid',
  contactPhone: '0000000',
  vatId: 'TEST_VAT',
  registerCourt: 'TEST_COURT',
  registerNumber: 'TEST_REG_1',
};

describe('Block D — legal operator + draft publish readiness', () => {
  const legalService = repo('backend/src/services/legal.service.ts');
  const legalRoutes = repo('backend/src/routes/legal.routes.ts');
  const routesIndex = repo('backend/src/routes/index.ts');
  const frontendRoutes = repo('frontend/src/routes/index.tsx');
  const footer = repo('frontend/src/components/legal/LegalFooter.tsx');
  const legalPage = repo('frontend/src/pages/legal/LegalPage.tsx');
  const landing = repo('frontend/src/pages/landing/LandingPage.tsx');
  const login = repo('frontend/src/pages/auth/LoginPage.tsx');
  const staticMw = repo('backend/src/middleware/static.ts');
  const adminRoutes = repo('backend/src/routes/admin.routes.ts');
  const html = repo('frontend/index.html');
  const sharedLegal = repo('shared/src/legal.ts');
  const authReg = repo('backend/src/services/auth-registration.service.ts');
  const userService = repo('backend/src/services/user.service.ts');

  it('exposes public impressum, datenschutz and agb without auth or invite', () => {
    assert.deepEqual(listLegalSlugs(), [...LEGAL_PUBLIC_SLUGS]);
    for (const slug of ['impressum', 'datenschutz', 'agb'] as const) {
      const page = getLegalPage(slug);
      assert.ok(page);
      assert.match(legalRoutes, new RegExp(`get\\('/${slug}'`));
      assert.equal(isPathAllowedForGate(`/legal/${slug}`, 'login'), true);
      assert.equal(isPathAllowedForGate(`/legal/${slug}`, 'verify-email'), true);
    }
    assert.match(routesIndex, /apiRouter\.use\('\/legal', legalRoutes\)/);
    assert.equal(legalRoutes.includes('authenticate'), false);
    assert.equal(legalRoutes.includes('invite'), false);
    assert.match(frontendRoutes, /path="\/legal\/:slug"/);
    assert.equal(frontendRoutes.includes('<ProtectedRoute>\n            <LegalPage'), false);
    assert.match(staticMw, /index\.html/);
    assert.match(staticMw, /req\.path\.startsWith\('\/api'\)/);
  });

  it('keeps footer and landing legal links on NEXTER /legal routes', () => {
    for (const href of ['/legal/impressum', '/legal/datenschutz', '/legal/agb']) {
      assert.match(footer, new RegExp(href.replaceAll('/', '\\/')));
      assert.match(landing, new RegExp(href.replaceAll('/', '\\/')));
    }
    assert.match(login, /to="\/legal\/agb"/);
    assert.match(login, /to="\/legal\/datenschutz"/);
    assert.equal(footer.includes('ucbs'), false);
    assert.equal(/nexa|creatorbrandingstudio/i.test(footer), false);
  });

  it('does not present placeholder tokens as live operator data', () => {
    for (const slug of LEGAL_PUBLIC_SLUGS) {
      const page = getLegalPage(slug)!;
      assert.equal(hasActiveLegalPlaceholderToken(page.html), false, slug);
      assert.equal(/Lorem ipsum/i.test(page.html), false, slug);
      assert.equal(/\[NAME\]|\[ADRESSE\]/.test(page.html), false, slug);
    }
    assert.equal(LEGAL_OPERATOR.operatorName, LEGAL_PLACEHOLDER.operatorName);
    assert.ok(missingLegalOperatorFields().length >= 8);
    assert.match(getLegalPage('impressum')!.html, /nicht hinterlegt/);
    assert.equal(legalService.includes('Max Mustermann'), false);
    assert.equal(legalService.includes('Musterstraße'), false);
  });

  it('fails closed: missing operator data cannot publish; complete mock can', () => {
    const missing = evaluateLegalPublishGate({
      intendedStatus: 'final',
      operator: LEGAL_OPERATOR,
      lastUpdated: LEGAL_LAST_UPDATED,
      termsVersion: LEGAL_TERMS_VERSION,
      privacyVersion: LEGAL_PRIVACY_VERSION,
      contentPresent: true,
      userFacingHtml: '<p>NEXTER Creator Studio</p>',
    });
    assert.equal(missing.publishable, false);
    assert.equal(missing.status, 'incomplete');
    assert.ok(missing.missingOperatorFields.includes('operatorName'));
    assert.ok(missing.reasons.includes('missing_operator_data'));

    const complete = evaluateLegalPublishGate({
      intendedStatus: 'final',
      operator: COMPLETE_OPERATOR,
      lastUpdated: '2026-09-17',
      termsVersion: 'v-final-terms',
      privacyVersion: 'v-final-privacy',
      contentPresent: true,
      userFacingHtml: '<p>NEXTER Creator Studio</p>',
    });
    assert.equal(complete.publishable, true);
    assert.equal(complete.status, 'published');
    assert.deepEqual(complete.missingOperatorFields, []);
  });

  it('keeps documents draft after build and never auto-publishes', () => {
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
    assert.match(sharedLegal, /export const LEGAL_TEXT_STATUS = 'draft'/);
    for (const slug of LEGAL_PUBLIC_SLUGS) {
      const page = getLegalPage(slug)!;
      assert.equal(page.publishable, false);
      assert.notEqual(page.publicationStatus, 'published');
      assert.equal(page.draft, true);
      assert.equal(page.documentVersion, LEGAL_DOCUMENT_VERSIONS[slug]);
      assert.equal(page.lastUpdated, LEGAL_LAST_UPDATED);
      assert.ok(page.documentVersion.length > 0);
      assert.ok(page.lastUpdated.length > 0);
    }
    assert.equal(legalPage.includes('Final'), false);
    assert.equal(legalPage.includes('Geprüft'), false);
    assert.equal(legalPage.includes('Verbindlich'), false);
    assert.equal(legalPage.includes('Vollständig'), false);
    assert.equal(legalRoutes.includes('draft: true'), false);
  });

  it('keeps NEXTER branding, no 135 price, welcome 50, payments off', () => {
    for (const slug of LEGAL_PUBLIC_SLUGS) {
      const htmlPage = getLegalPage(slug)!.html;
      assert.match(htmlPage, /NEXTER/);
      assert.equal(/UCBS|Nexa\b|Creator Branding Studio/.test(htmlPage), false, slug);
      assert.equal(htmlPage.includes('135'), false, slug);
    }
    assert.equal(getDefaultFreeCoins(), 50);
    assert.match(getLegalPage('agb')!.html, /Welcome-Bonus 50/);
    assert.equal(Object.values(COIN_COSTS).includes(135), false);
    assert.equal(arePaymentsEnabled(), false);
    assert.match(getLegalPage('agb')!.html, /Zahlungen deaktiviert|keine Stripe- oder PayPal-Käufe/);
    assert.match(getLegalPage('datenschutz')!.html, /Zahlungen sind derzeit deaktiviert/);
  });

  it('classifies providers without activating them and without tracking scripts', () => {
    const privacy = getLegalPage('datenschutz')!.html;
    assert.match(privacy, /Firebase Authentication/);
    assert.match(privacy, /Railway/);
    assert.match(privacy, /Discord OAuth/);
    assert.match(privacy, /Twitch OAuth/);
    assert.match(privacy, /TikTok OAuth/);
    assert.match(privacy, /Microsoft OAuth/);
    assert.match(privacy, /Resend/);
    assert.match(privacy, /UNAVAILABLE/);
    assert.match(privacy, /Stripe/);
    assert.match(privacy, /PayPal/);
    assert.match(privacy, /OpenAI/);
    assert.match(privacy, /Replicate/);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(html.includes('googletagmanager'), false);
    assert.equal(html.includes('google-analytics'), false);
    assert.equal(html.includes('gtag('), false);
    assert.equal(html.includes('facebook.net'), false);
    assert.equal(/hotjar|clarity|tiktok.*pixel/i.test(html), false);
    assert.equal(legalPage.toLowerCase().includes('cookie banner'), false);
    assert.equal(legalService.includes('FIREBASE_PRIVATE_KEY'), false);
    assert.equal(legalService.includes('sk_live'), false);
    assert.equal(legalService.includes('RESEND_API_KEY'), false);
  });

  it('persists acceptance with user, version and acceptedAt; users cannot edit legal CMS', () => {
    assert.equal(LEGAL_REACCEPTANCE_REQUIRED, false);
    assert.equal(shouldForceLegalReacceptance(undefined), false);
    const acceptance = currentDraftLegalAcceptanceInput();
    assert.equal(acceptance.termsVersion, LEGAL_TERMS_VERSION);
    assert.equal(acceptance.privacyVersion, LEGAL_PRIVACY_VERSION);
    assert.match(authReg, /termsVersion: LEGAL_TERMS_VERSION/);
    assert.match(authReg, /privacyVersion: LEGAL_PRIVACY_VERSION/);
    assert.match(authReg, /acceptedAt: new Date\(\)\.toISOString\(\)/);
    assert.match(userService, /if \(options\.legalAcceptance\)/);
    assert.match(userService, /omitUndefinedFields/);
    assert.equal(adminRoutes.includes('/legal'), false);
    assert.match(adminRoutes, /requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)/);
    const uid = `legal-d-${randomUUID()}`;
    assert.ok(uid.startsWith('legal-d-'));
  });
});
