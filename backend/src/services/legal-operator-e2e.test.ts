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
  CoinSpendCategory,
  currentDraftLegalAcceptanceInput,
  displayOperatorValue,
  evaluateLegalPublishGate,
  hasActiveLegalPlaceholderToken,
  isLegalPlaceholderValue,
  missingLegalOperatorFields,
  shouldForceLegalReacceptance,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
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
    assert.equal(LEGAL_OPERATOR.operatorName, 'Lars Gaube');
    assert.ok(missingLegalOperatorFields().includes('street'));
    assert.ok(missingLegalOperatorFields().includes('postalCode'));
    assert.ok(missingLegalOperatorFields().includes('contactEmail'));
    assert.equal(missingLegalOperatorFields().includes('operatorName'), false);
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
    assert.ok(missing.missingOperatorFields.includes('street'));
    assert.ok(missing.missingOperatorFields.includes('contactEmail'));
    assert.equal(missing.missingOperatorFields.includes('operatorName'), false);
    assert.equal(missing.missingOperatorFields.includes('vatId'), false);
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

describe('Block D/R — confirmed operator data stays draft', () => {
  const requiredOnlyOperator: Record<LegalOperatorField, string> = {
    operatorName: 'TEST_OPERATOR_COMPLETE',
    companyName: 'TEST_COMPANY_COMPLETE',
    legalForm: '',
    street: 'TEST_STREET_1',
    postalCode: '00000',
    city: 'TEST_CITY',
    country: 'TEST_COUNTRY',
    contactEmail: 'operator@test.invalid',
    contactPhone: '',
    vatId: '',
    registerCourt: '',
    registerNumber: '',
  };

  it('1-4. shows confirmed operator, business name, city and country', () => {
    const impressum = getLegalPage('impressum')!;
    assert.equal(LEGAL_OPERATOR.operatorName, 'Lars Gaube');
    assert.equal(LEGAL_OPERATOR.companyName, 'NEXTER');
    assert.equal(LEGAL_OPERATOR.city, 'Hamburg');
    assert.equal(LEGAL_OPERATOR.country, 'Deutschland');
    assert.match(impressum.html, /Lars Gaube/);
    assert.match(impressum.html, /Geschäfts-\/Projektname: NEXTER/);
    assert.match(impressum.html, /Hamburg/);
    assert.match(impressum.html, /Deutschland/);
    assert.equal(impressum.draft, true);
    assert.equal(impressum.publishable, false);
  });

  it('5-10. does not invent street, postal code, e-mail, phone, VAT or register data', () => {
    assert.equal(isLegalPlaceholderValue(LEGAL_OPERATOR.street), true);
    assert.equal(isLegalPlaceholderValue(LEGAL_OPERATOR.postalCode), true);
    assert.equal(isLegalPlaceholderValue(LEGAL_OPERATOR.contactEmail), true);
    assert.equal(isLegalPlaceholderValue(LEGAL_OPERATOR.contactPhone), true);
    assert.equal(isLegalPlaceholderValue(LEGAL_OPERATOR.vatId), true);
    assert.equal(isLegalPlaceholderValue(LEGAL_OPERATOR.registerCourt), true);
    assert.equal(isLegalPlaceholderValue(LEGAL_OPERATOR.registerNumber), true);
    assert.equal(LEGAL_OPERATOR.street, '');
    assert.equal(LEGAL_OPERATOR.postalCode, '');
    assert.equal(LEGAL_OPERATOR.contactEmail, '');
    const impressum = getLegalPage('impressum')!.html;
    assert.doesNotMatch(impressum, /Musterstraße|Example Street|Fiktive Straße/i);
    assert.doesNotMatch(impressum, /\b\d{5}\b/);
    assert.doesNotMatch(impressum, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    assert.doesNotMatch(impressum, /\+49|Telefon:/);
    assert.doesNotMatch(impressum, /USt-IdNr\.:|DE\d{9}/);
    assert.doesNotMatch(impressum, /Registergericht:|Registernummer:|HRB\s*\d+/);
    assert.equal(LEGAL_PLACEHOLDER.street.includes('EINTRAGEN'), true);
  });

  it('11. never prints undefined, null or PLACEHOLDER as operator values', () => {
    assert.equal(displayOperatorValue(undefined), 'noch nicht hinterlegt');
    assert.equal(displayOperatorValue(null), 'noch nicht hinterlegt');
    for (const slug of LEGAL_PUBLIC_SLUGS) {
      const html = getLegalPage(slug)!.html;
      assert.doesNotMatch(html, /\bundefined\b/);
      assert.doesNotMatch(html, /\bnull\b/);
      assert.doesNotMatch(html, /\bPLACEHOLDER\b/);
    }
  });

  it('12-14. publish gate stays closed because address and contact e-mail are missing', () => {
    const live = evaluateLegalPublishGate({
      intendedStatus: 'final',
      operator: LEGAL_OPERATOR,
      lastUpdated: LEGAL_LAST_UPDATED,
      termsVersion: LEGAL_TERMS_VERSION,
      privacyVersion: LEGAL_PRIVACY_VERSION,
      contentPresent: true,
      userFacingHtml: '<p>NEXTER Creator Studio</p>',
    });
    assert.equal(live.publishable, false);
    assert.equal(getLegalPage('impressum')!.publishable, false);
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
    assert.ok(live.missingOperatorFields.includes('street'));
    assert.ok(live.missingOperatorFields.includes('postalCode'));
    assert.ok(live.missingOperatorFields.includes('contactEmail'));
    assert.match(getLegalPage('impressum')!.html, /Straße und PLZ noch nicht hinterlegt/);
    assert.match(getLegalPage('impressum')!.html, /E-Mail: noch nicht hinterlegt/);
  });

  it('15-16. empty VAT or register fields alone are not invented publish blockers', () => {
    const gate = evaluateLegalPublishGate({
      intendedStatus: 'final',
      operator: requiredOnlyOperator,
      lastUpdated: LEGAL_LAST_UPDATED,
      termsVersion: 'v-final-terms',
      privacyVersion: 'v-final-privacy',
      contentPresent: true,
      userFacingHtml: '<p>NEXTER Creator Studio</p>',
    });
    assert.equal(gate.publishable, true);
    assert.deepEqual(gate.missingOperatorFields, []);
    assert.equal(gate.missingOperatorFields.includes('vatId'), false);
    assert.equal(gate.missingOperatorFields.includes('registerCourt'), false);
    assert.equal(gate.missingOperatorFields.includes('registerNumber'), false);
    assert.equal(gate.missingOperatorFields.includes('contactPhone'), false);
  });

  it('17-19. Block R content-rights safety, reporting and takedown stay in place', () => {
    const agb = getLegalPage('agb')!.html;
    assert.match(agb, /TODO — User Content Rights/);
    assert.match(agb, /TODO — Copyright\/Trademark Complaints/);
    assert.match(agb, /TODO — AI Generated Content/);
    assert.match(agb, /TODO — Voice Consent/);
    assert.match(agb, /TODO — Commercial Use/);
    assert.match(agb, /TODO — Provider Terms/);
    assert.match(agb, /LEGAL REVIEW REQUIRED/);
    const rights = repo('backend/src/services/content-rights.service.ts');
    assert.match(rights, /submitContentRightsReport/);
    assert.match(rights, /adminTakedownReportedFile/);
    assert.match(rights, /deleteUserFile/);
    assert.match(rights, /applyRightsTakedownFlag/);
    assert.doesNotMatch(rights, /acceptRightsForUser/);
  });

  it('20. pricing, payments and draft legal status stay unchanged', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
  });
});
