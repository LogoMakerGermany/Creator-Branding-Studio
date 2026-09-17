import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGAL_OPERATOR,
  LEGAL_PRIVACY_VERSION,
  LEGAL_PUBLIC_SLUGS,
  LEGAL_REACCEPTANCE_REQUIRED,
  LEGAL_TERMS_VERSION,
  LEGAL_TEXT_STATUS,
  currentDraftLegalAcceptanceInput,
  missingLegalOperatorFields,
  shouldForceLegalReacceptance,
} from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { getLegalPage, listLegalSlugs, existingUserNeedsLegalReacceptance } from './legal.service.js';
import { getOrCreateUser, getUserById } from './user.service.js';
import { createInviteCode, getInviteByCode } from './invite.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { exportAccountData } from './account.service.js';
import { getRegistrationMode, getSystemSettings, updateSystemSettings } from './system-settings.service.js';
import type { RegistrationMode } from '@ucbs/shared';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

async function withRegistrationMode<T>(mode: RegistrationMode, fn: () => Promise<T>): Promise<T> {
  const prev = (await getSystemSettings()).registrationMode;
  await updateSystemSettings({ registrationMode: mode }, 'legal-pages-test');
  try {
    return await fn();
  } finally {
    await updateSystemSettings({ registrationMode: prev }, 'legal-pages-test');
  }
}

const FAKE_OPERATOR = [
  'Max Mustermann',
  'Musterstraße',
  'Musterfirma GmbH',
  'HRB 123456',
  'DE123456789',
  'info@nexter.example',
  '+49 123 456789',
];

function assertNoFakeOperator(text: string) {
  for (const fake of FAKE_OPERATOR) {
    assert.equal(text.includes(fake), false, `fake operator data: ${fake}`);
  }
}

describe('legal pages local closure', () => {
  const legalService = src('src/services/legal.service.ts');
  const legalRoutes = src('src/routes/legal.routes.ts');
  const legalPage = repo('frontend/src/pages/legal/LegalPage.tsx');
  const login = repo('frontend/src/pages/auth/LoginPage.tsx');
  const authLayout = repo('frontend/src/components/layout/AuthLayout.tsx');
  const verify = repo('frontend/src/pages/auth/VerifyEmailPage.tsx');
  const landing = repo('frontend/src/pages/landing/LandingPage.tsx');
  const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
  const routes = repo('frontend/src/routes/index.tsx');
  const gates = repo('frontend/src/lib/auth-gates.ts');
  const ctx = repo('frontend/src/context/AuthContext.tsx');
  const html = repo('frontend/index.html');
  const sharedLegal = repo('shared/src/legal.ts');

  it('reuses public /legal routes, draft status, and central versions', () => {
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
    assert.equal(LEGAL_REACCEPTANCE_REQUIRED, false);
    assert.deepEqual(listLegalSlugs(), [...LEGAL_PUBLIC_SLUGS]);
    assert.match(routes, /path="\/legal\/:slug"/);
    assert.match(gates, /pathname.startsWith\('\/legal'\)/);
    assert.match(legalRoutes, /Entwurf \/ vor Veröffentlichung rechtlich prüfen lassen/);
    assert.equal(legalRoutes.includes('rechtsgeprüft'), false);
    assert.match(sharedLegal, /LEGAL_TERMS_VERSION/);
    assert.match(sharedLegal, /LEGAL_PRIVACY_VERSION/);
    for (const slug of LEGAL_PUBLIC_SLUGS) {
      const page = getLegalPage(slug);
      assert.ok(page);
      assert.equal(page.draft, true);
      assert.equal(page.status, 'draft');
      assert.equal(page.publicationStatus, 'draft');
      assert.equal(page.publishable, false);
      assert.match(page.notice, /Entwurf/);
      assert.ok(page.lastUpdated);
      assert.ok(page.documentVersion);
      assert.equal(page.seoTitle.includes('Entwurf'), true);
      assert.equal(/DSGVO-zertifiziert|100 % DSGVO|vollständig rechtssicher|anwaltlich geprüft/.test(page.html), false);
    }
    assert.equal(getLegalPage('privacy'), null);
    assert.equal(getLegalPage('impressum')?.title, 'Impressum');
    assert.equal(getLegalPage('datenschutz')?.title, 'Datenschutzerklärung');
    assert.equal(getLegalPage('agb')?.title, 'Nutzungsbedingungen');
  });

  it('keeps operator placeholders and does not invent company data', () => {
    const fields = missingLegalOperatorFields();
    assert.ok(fields.length >= 8);
    assert.ok(fields.includes('operatorName'));
    assert.ok(fields.includes('contactEmail'));
    assert.ok(fields.includes('vatId'));
    const impressum = getLegalPage('impressum')!;
    assert.equal(/EINTRAGEN/.test(impressum.html), false);
    assert.match(impressum.html, /nicht hinterlegt/);
    assert.match(impressum.html, /Fehlende Pflichtangaben/);
    assert.match(sharedLegal, /BETREIBER_NAME_EINTRAGEN/);
    assert.match(sharedLegal, /KONTAKT_EMAIL_EINTRAGEN/);
    assertNoFakeOperator(impressum.html);
    assertNoFakeOperator(legalService);
    assertNoFakeOperator(legalPage);
    assert.equal(LEGAL_OPERATOR.operatorName.includes('EINTRAGEN'), true);
  });

  it('privacy/terms inventory matches actual architecture', () => {
    const privacy = getLegalPage('datenschutz')!;
    const terms = getLegalPage('agb')!;
    const cookies = getLegalPage('cookies')!;
    assert.match(privacy.html, /Firebase Authentication/);
    assert.match(privacy.html, /Firestore/);
    assert.match(privacy.html, /Firebase Storage/);
    assert.equal(privacy.html.includes('Firebase Hosting wird in der aktuellen Auslieferung nicht als Betriebsweg behauptet'), true);
    assert.match(privacy.html, /Google Login/);
    assert.match(privacy.html, /Creator DNA/);
    assert.match(privacy.html, /Nexter-Sitzungen/);
    assert.match(privacy.html, /Coin-Guthaben/);
    assert.match(privacy.html, /provider-gated/);
    assert.match(privacy.html, /Zahlungen sind derzeit deaktiviert/);
    assert.match(privacy.html, /Welcome-Bonus 50/);
    assert.match(privacy.html, /keine Kryptowährung/);
    assert.match(privacy.html, /Aufbewahrungsfristen sind technisch nicht festgelegt/);
    assert.match(privacy.html, /Google Fonts/);
    assert.match(privacy.html, /localStorage/);
    assert.match(privacy.html, /sessionStorage/);
    assert.match(privacy.html, /Google Analytics, Meta Pixel/);
    assert.match(terms.html, /geschlossenen Creator-Beta/);
    assert.match(terms.html, /keine automatische Rechteprüfung/);
    assert.match(terms.html, /nicht pauschal zugesichert/);
    assert.match(terms.html, /exklusiven Urheberrechte/);
    assert.match(terms.html, /nicht auszahlbar/);
    assert.match(terms.html, /Verbotene Inhalte|Rechtswidrige/);
    assert.match(cookies.html, /Kein Marketing-Cookie-Banner/);
    assert.equal(privacy.html.toLowerCase().includes('kryptowährung'), true);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
  });

  it('footer, landing, auth and settings expose the same legal links', () => {
    const footer = repo('frontend/src/components/legal/LegalFooter.tsx');
    assert.match(footer, /\/legal\/impressum/);
    assert.match(footer, /\/legal\/datenschutz/);
    assert.match(footer, /\/legal\/agb/);
    assert.match(landing, /\/legal\/impressum/);
    assert.match(landing, /\/legal\/datenschutz/);
    assert.match(landing, /\/legal\/agb/);
    assert.match(landing, /\/legal\/widerruf/);
    assert.match(login, /to="\/legal\/agb"/);
    assert.match(login, /to="\/legal\/datenschutz"/);
    assert.match(authLayout, /LegalFooter/);
    assert.match(verify, /LegalFooter/);
    assert.match(settings, /LegalFooter/);
    assert.match(settings, /Datenexport/);
    assert.match(settings, /Konto löschen/);
    assert.match(legalPage, /<h1/);
    assert.match(legalPage, /max-w-2xl/);
    assert.match(legalPage, /print/);
    assert.match(legalPage, /LegalBlocks/);
  });

  it('registration checkbox is unchecked, linked, and server-validated', async () => {
    assert.match(login, /id="register-legal"/);
    assert.match(login, /checked=\{legalAccepted\}/);
    assert.equal(login.includes('defaultChecked'), false);
    assert.equal(/checked=\{true\}/.test(login), false);
    assert.match(login, /to="\/legal\/agb"/);
    assert.match(login, /to="\/legal\/datenschutz"/);
    assert.match(login, /Ich akzeptiere die/);
    assert.match(ctx, /LEGAL_ACCEPTANCE_REQUIRED/);
    assert.match(ctx, /pending_legal_acceptance/);
    assert.match(src('src/routes/auth.routes.ts'), /acceptedTermsVersion/);
    assert.equal(ctx.includes('fingerprint'), false);
    assert.equal(legalService.includes('fingerprint'), false);

    await withRegistrationMode((await getRegistrationMode()) === 'closed' ? 'invite_only' : 'invite_only', async () => {
      const existing = await getOrCreateUser(`lg-ex-${randomUUID()}`, 'exist@legal.test', 'Exist');
      const relogin = await syncAuthenticatedAppUser({
        uid: existing.id,
        email: existing.email,
        authProvider: 'email',
      });
      assert.equal(relogin.created, false);
      assert.equal(existingUserNeedsLegalReacceptance(relogin.user.legalAcceptance), false);
      assert.equal(shouldForceLegalReacceptance(undefined), false);

      const invite = await createInviteCode({ description: 'legal', maximumUses: 2 }, 'legal-admin');
      const blockedUid = `lg-block-${randomUUID()}`;
      await assert.rejects(
        () =>
          syncAuthenticatedAppUser({
            uid: blockedUid,
            email: `${blockedUid}@legal.test`,
            inviteCode: invite.code,
            authProvider: 'email',
          }),
        (err: unknown) => err instanceof AppError && err.code === 'LEGAL_ACCEPTANCE_REQUIRED'
      );
      assert.equal(await getUserById(blockedUid), null);
      assert.equal((await getInviteByCode(invite.code))?.currentUses, 0);

      const createdUid = `lg-ok-${randomUUID()}`;
      const created = await syncAuthenticatedAppUser({
        uid: createdUid,
        email: `${createdUid}@legal.test`,
        inviteCode: invite.code,
        authProvider: 'email',
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      });
      assert.equal(created.created, true);
      assert.equal(created.user.legalAcceptance?.termsVersion, LEGAL_TERMS_VERSION);
      assert.equal(created.user.legalAcceptance?.privacyVersion, LEGAL_PRIVACY_VERSION);
      assert.ok(created.user.legalAcceptance?.acceptedAt);
      const exported = await exportAccountData(createdUid);
      assert.equal((exported.user.legalAcceptance as { termsVersion?: string } | undefined)?.termsVersion, LEGAL_TERMS_VERSION);
    });
  });

  it('does not add a fake cookie banner, tracking pixels, or secret leakage', () => {
    assert.equal(legalPage.toLowerCase().includes('cookie banner'), false);
    assert.equal(landing.toLowerCase().includes('cookie-banner'), false);
    assert.equal(html.includes('googletagmanager'), false);
    assert.equal(html.includes('google-analytics'), false);
    assert.equal(html.includes('facebook.net'), false);
    assert.match(html, /fonts.googleapis.com/);
    assert.equal(legalService.includes('FIREBASE_PRIVATE_KEY'), false);
    assert.equal(legalService.includes('sk_live'), false);
    assert.equal(legalPage.includes('FIREBASE_PRIVATE_KEY'), false);
    assert.equal(legalPage.includes("from 'firebase/firestore'"), false);
    assert.equal(legalPage.includes("from 'firebase/storage'"), false);
    assert.equal(login.includes("from 'firebase/firestore'"), false);
    assert.match(cookiesInventory(), /auth_token/);
  });

  it('account delete/export wording stays compatible and payments stay off', () => {
    const privacy = getLegalPage('datenschutz')!;
    assert.match(privacy.html, /Datenexport/);
    assert.match(privacy.html, /nicht behauptet, dass jede Sicherung sofort physisch verschwindet/);
    assert.match(repo('backend/src/services/account.service.ts'), /exportAccountData/);
    assert.match(repo('backend/src/services/account.service.ts'), /requestAccountDeletion/);
    assert.match(settings, /exportAccountData|Eigene Daten exportieren/);
    assert.match(settings, /DELETE_ACCOUNT/);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(getLegalPage('agb')!.html.includes('Stripe- oder PayPal-Käufe statt'), true);
  });
});

function cookiesInventory(): string {
  return getLegalPage('cookies')!.html;
}
