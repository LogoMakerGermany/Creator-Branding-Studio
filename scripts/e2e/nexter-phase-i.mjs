/**
 * Phase I local acceptance: money, admin UX, legal drafts, export/delete, no real payments.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-i.mjs
 */
import { chromium } from 'playwright';
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    console.log('\n== Phase I: Login / admin guard ==');
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page);
    record('login', page.url().includes('/dashboard'), page.url());

    await page.goto(BASE + '/admin');
    await page.waitForTimeout(800);
    record('admin-route-blocked', !page.url().endsWith('/admin') || page.url().includes('/dashboard'), page.url());

    const adminApi = await api(page, '/api/v1/admin/users');
    record('admin-api-403', adminApi.status === 403, `status=${adminApi.status}`);

    const audit = await api(page, '/api/v1/admin/audit');
    record('audit-forbidden', audit.status === 403, `status=${audit.status}`);

    console.log('\n== Phase I: Coins / Dev-Purchase ==');
    const me1 = await api(page, '/api/v1/auth/me');
    const before = me1.json?.data?.user?.coinBalance ?? 0;
    const key = `e2e-i-${Date.now()}`;
    const buy1 = await api(page, '/api/v1/stripe/dev-purchase', {
      method: 'POST',
      body: JSON.stringify({ packageId: 'starter', idempotencyKey: key }),
    });
    const buy2 = await api(page, '/api/v1/stripe/dev-purchase', {
      method: 'POST',
      body: JSON.stringify({ packageId: 'starter', idempotencyKey: key }),
    });
    const me2 = await api(page, '/api/v1/auth/me');
    const after = me2.json?.data?.user?.coinBalance ?? 0;
    const added = after - before;
    record(
      'dev-purchase-once',
      (buy1.status < 300 || buy1.status === 503) && added <= 150,
      `status=${buy1.status}/${buy2.status} delta=${added}`
    );
    if (buy1.status < 300) {
      record('dev-purchase-idempotent', added === 100, `delta=${added}`);
    } else {
      record('dev-purchase-idempotent', buy1.status === 403 || buy1.status === 503, 'dev purchase unavailable');
    }

    const txs = await api(page, '/api/v1/coins/transactions');
    record('ledger-readable', txs.status < 300, `status=${txs.status}`);

    console.log('\n== Phase I: Legal / export / delete ==');
    await page.goto(BASE + '/legal/agb');
    await page.waitForTimeout(600);
    const legalText = await page.locator('article').innerText();
    record('legal-draft', /Entwurf|rechtlich prüfen/.test(legalText), legalText.slice(0, 80));

    const exported = await api(page, '/api/v1/auth/export');
    const blob = JSON.stringify(exported.json);
    record(
      'export-own',
      exported.status < 300 && !/sk_live|whsec_|OPENAI_API_KEY/.test(blob),
      `status=${exported.status}`
    );

    const badDelete = await api(page, '/api/v1/auth/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirmation: 'yes' }),
    });
    record('delete-needs-confirm', badDelete.status >= 400, `status=${badDelete.status}`);

    const recover = await api(page, '/api/v1/admin/jobs/recover', { method: 'POST' });
    record('creator-cannot-recover', recover.status === 403, `status=${recover.status}`);

    const filesNoRights = await api(page, '/api/v1/files', {
      method: 'POST',
      body: JSON.stringify({
        name: 'x.png',
        mimeType: 'image/png',
        category: 'logo',
        dataUrl:
          'data:image/png;base64,iVBORw0KGoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      }),
    });
    record('upload-requires-rights', filesNoRights.status === 400, `status=${filesNoRights.status}`);
  } catch (err) {
    record('uncaught', false, err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nPhase I: ${passed}/${results.length} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}

main();
