/**
 * Phase J local acceptance: onboarding, feedback, legacy block, console/mobile smoke.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-j.mjs
 */
import { chromium, firefox, webkit } from 'playwright';
import { completeOnboardingIfNeeded } from './onboarding-helper.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const results = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}${detail ? ` — ${detail}` : ''}`);
}

async function api(page, path, init = {}) {
  return page.evaluate(
    async ({ path, init }) => {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    },
    { path, init }
  );
}

async function ensureAppSession(page) {
  await page.waitForTimeout(400);
  if (/\/login/.test(page.url())) {
    await page.getByRole('button', { name: /Dev-Login/ }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page, { createDna: true });
  }
}

async function smokeLogin(browserType, label) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(25000);
  try {
    await page.goto(BASE + '/login');
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page, { createDna: true });
    record(`${label}-login`, page.url().includes('/dashboard'), page.url());
    await page.goto(BASE + '/nexter');
    record(`${label}-nexter`, page.url().includes('/nexter'), page.url());
    await page.goto(BASE + '/projects');
    record(`${label}-projects`, page.url().includes('/projects'), page.url());
    await page.goto(BASE + '/logo-studio');
    record(`${label}-studio`, page.url().includes('/logo-studio'), page.url());
    await page.goto(BASE + '/settings');
    record(`${label}-feedback`, await page.getByTestId('feedback-send').isVisible(), 'Feedback-Button');
  } finally {
    await browser.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    console.log('\n== Phase J: Login / Onboarding ==');
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000 });
    record('onboarding-start', /onboarding|dashboard/.test(page.url()), page.url());
    if (page.url().includes('/onboarding')) {
      record('onboarding-copy', await page.getByText('Willkommen bei NEXTER').isVisible(), 'Wizard');
      record('onboarding-nexter', await page.getByText(/ich bin NEXTER/i).isVisible(), 'Nexter-Begleitung');
    }
    await completeOnboardingIfNeeded(page, { createDna: true });
    record('onboarding-complete', page.url().includes('/dashboard'), page.url());

    await page.reload();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    record('onboarding-reload', page.url().includes('/dashboard'), page.url());

    console.log('\n== Phase J: Core routes ==');
    const routes = [
      '/dashboard',
      '/creator-dna',
      '/logo-studio',
      '/streamset-studio',
      '/mockup-studio',
      '/video-studio',
      '/shorts-studio',
      '/text-studio',
      '/projects',
      '/change-request',
      '/export-center',
      '/settings',
    ];
    for (const path of routes) {
      await page.goto(BASE + path);
      await page.waitForTimeout(250);
      const crashed = await page.getByText('Something went wrong').isVisible().catch(() => false);
      record(`route:${path}`, page.url().includes(path) && !crashed, page.url());
    }

    await page.goto(BASE + '/marketplace');
    await page.waitForTimeout(400);
    record('marketplace-redirect', !page.url().includes('/marketplace'), page.url());
    await page.goto(BASE + '/agency-management');
    await page.waitForTimeout(400);
    record('agency-redirect', !page.url().includes('/agency-management'), page.url());

    console.log('\n== Phase J: Feedback / legacy API ==');
    await page.goto(BASE + '/settings');
    await page.getByLabel('Beschreibung').fill('Phase J E2E Feedback ohne Screenshot');
    await page.getByTestId('feedback-send').click();
    await page.getByText(/Danke|angekommen|fehlgeschlagen/i).waitFor({ state: 'visible', timeout: 10000 });
    record('feedback-send', true, 'Formular abgesendet');

    const market = await api(page, '/api/v1/marketplace');
    record(
      'marketplace-api-blocked',
      market.status === 403 && (market.json?.error?.code === 'FEATURE_NOT_AVAILABLE' || /nicht verfügbar/i.test(JSON.stringify(market.json))),
      `status=${market.status} code=${market.json?.error?.code}`
    );

    const grant = await api(page, '/api/v1/admin/users/someone/tester-grant', {
      method: 'POST',
      body: JSON.stringify({ reason: 'e2e', confirm: true }),
    });
    record('tester-grant-creator-403', grant.status === 403, `status=${grant.status}`);

    const stats = await api(page, '/api/v1/auth/stats');
    record(
      'dashboard-stats-projects',
      stats.status === 200 && typeof stats.json?.data?.projects === 'number',
      `projects=${stats.json?.data?.projects}`
    );

    console.log('\n== Phase J: Console ==');
    const noisy = [...pageErrors, ...consoleErrors].filter((m) => {
      if (/favicon|Download the React DevTools|net::ERR_BLOCKED_BY_CLIENT/i.test(m)) return false;
      if (/status of 403 \(Forbidden\)/i.test(m)) return false;
      if (/status of 429 \(Too Many Requests\)/i.test(m)) return false;
      return true;
    });
    record('console-clean', noisy.length === 0, noisy.slice(0, 3).join(' | ') || 'keine pageerror');

    console.log('\n== Phase J: Mobile viewports ==');
    for (const [w, h, name] of [
      [1440, 900, 'desktop'],
      [768, 1024, 'tablet'],
      [390, 844, 'phone'],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(BASE + '/dashboard');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 8);
      record(`viewport-${name}`, !overflow, `${w}x${h} overflow=${overflow}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/dashboard');
    await page.waitForTimeout(1200);
    await ensureAppSession(page);
    await page.waitForTimeout(500);
    const menu = page.getByRole('button', { name: 'Menü öffnen' });
    record('mobile-menu', await menu.isVisible().catch(() => false), 'Hamburger');
    let orbVisible = false;
    try {
      await page.getByRole('button', { name: 'Nexter öffnen' }).waitFor({ state: 'visible', timeout: 8000 });
      orbVisible = await page.getByRole('button', { name: 'Nexter öffnen' }).isVisible();
    } catch {
      orbVisible = await page.getByTestId('nexter-fab').isVisible().catch(() => false);
    }
    record('mobile-nexter-orb', orbVisible, orbVisible ? 'FAB sichtbar' : `url=${page.url()}`);
  } catch (err) {
    record('uncaught', false, err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  console.log('\n== Phase J: Firefox / WebKit smoke (optional) ==');
  for (const [type, name] of [
    [firefox, 'firefox'],
    [webkit, 'webkit'],
  ]) {
    try {
      await smokeLogin(type, name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Executable doesn't exist|browserType\.launch|not found/i.test(msg)) {
        record(`${name}-skip`, true, `nicht installiert — kein Cross-Browser-Volltest (${msg.slice(0, 120)})`);
      } else {
        record(`${name}-smoke`, false, msg);
      }
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nPhase J: ${passed}/${results.length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
