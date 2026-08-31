/**
 * Phase E local acceptance: Mockup Studio — composite without AI, lifestyle only via Nexter quote.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-e.mjs
 */
import { chromium } from 'playwright';
import { completeOnboardingIfNeeded } from './onboarding-helper.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const results = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${id}${detail ? ` — ${detail}` : ''}`);
}

async function api(page, path, init = {}, timeout = 120000) {
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
    { path, init, timeout }
  );
}

async function sendChat(page, text) {
  const input = page.getByPlaceholder('Frag Nexter…').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
  await input.fill(text);
  await page.getByRole('button', { name: 'Senden' }).first().click();
  await page.getByText(text).last().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2200);
}

async function panelText(page) {
  const panel = page.locator('aside').filter({ has: page.getByPlaceholder('Frag Nexter…') }).first();
  return panel.innerText();
}

async function coins(page) {
  const me = await api(page, '/api/v1/auth/me');
  return me.json?.data?.user?.coinBalance ?? 0;
}

async function ensureDna(page) {
  const created = await api(page, '/api/v1/dna', {
    method: 'POST',
    body: JSON.stringify({
      name: 'NightWolf',
      mascot: 'Cyber-Wolf',
      styleDirection: 'gaming',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#7C3AED'],
      character: { present: true, type: 'animal', description: 'Cyber-Wolf with violet eyes' },
      locks: { colors: true, character: true, mascot: true },
    }),
  });
  return created.json?.data?.dna ?? (await api(page, '/api/v1/dna/active')).json?.data?.dna;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log('\n== Phase E: Login → DNA → Mockup Studio ==');
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByRole('button', { name: /Dev-Login/ }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page);
    record('login', page.url().includes('/dashboard'), page.url());

    const dna = await ensureDna(page);
    record('dna-ready', Boolean(dna?.name), dna?.name || 'keine DNA');

    const coinsStart = await coins(page);
    record('coins-start', coinsStart >= 8, `coins=${coinsStart}`);

    await page.locator('aside nav a', { hasText: 'Mockup Studio' }).first().click();
    await page.waitForURL(/\/mockup-studio/);
    record('mockup-page', page.url().includes('/mockup-studio'), page.url());

    await page.getByTestId('mockup-wizard').waitFor({ state: 'visible', timeout: 10000 });
    record('wizard-visible', await page.getByTestId('mockup-wizard').isVisible(), 'Wizard');
    record('tab-tassen', await page.getByTestId('mockup-tab-mug').isVisible(), 'Tassen');
    record('tab-shirts', await page.getByTestId('mockup-tab-tshirt').isVisible(), 'T-Shirts');
    record('tab-mehr', await page.getByTestId('mockup-tab-tote').isVisible(), 'Mehr');
    record('live-preview', await page.getByTestId('mockup-preview').isVisible(), 'Live-Vorschau');
    record('gallery', await page.getByTestId('mockup-gallery').isVisible(), 'Produktgalerie');
    record('nexter-chip', await page.getByTestId('mockup-nexter-chip').isVisible(), 'Nexter-Chip');
    record(
      'no-lifestyle-checkbox',
      (await page.locator('input[type="checkbox"]').count()) === 0,
      'kein Lifestyle-Direkt-Checkbox'
    );

    console.log('\n== Phase E: Composite without AI / coins ==');
    await page.getByText(/DNA:\s*NightWolf/i).first().waitFor({ timeout: 15000 }).catch(() => undefined);
    const urlInput = page.getByTestId('mockup-design-url');
    await urlInput.click();
    await urlInput.fill('');
    await urlInput.fill(TINY_PNG);
    const filled = await urlInput.inputValue();
    record('design-url-filled', filled.startsWith('data:image'), filled.slice(0, 32));
    await page.getByTestId('mockup-color-black').click();
    await page.getByTestId('mockup-save-composite').waitFor({ state: 'visible' });
    await page.getByTestId('mockup-save-composite').click({ timeout: 15000 });
    await page.getByTestId('mockup-result-image').waitFor({ state: 'visible', timeout: 20000 });
    record('composite-image', await page.getByTestId('mockup-result-image').isVisible(), 'SVG-Composite');

    const listed = await api(page, '/api/v1/mockups');
    const jobs = listed.json?.data?.jobs ?? [];
    const composite = jobs.find((j) => j.lifestyle === false && j.imageUrl);
    record(
      'composite-provider',
      composite?.provider === 'composite' && String(composite.imageUrl).includes('svg'),
      `provider=${composite?.provider} url=${String(composite?.imageUrl ?? '').slice(0, 40)}`
    );
    const coinsAfterComposite = await coins(page);
    record(
      'composite-coins-unchanged',
      coinsAfterComposite === coinsStart,
      `start=${coinsStart} after=${coinsAfterComposite}`
    );

    const savedFile = await api(page, `/api/v1/mockups/${composite.id}/save-file`, { method: 'POST' });
    record(
      'save-file',
      savedFile.status === 201 && Boolean(savedFile.json?.data?.file?.id),
      `status=${savedFile.status}`
    );

    const createdProject = await api(page, '/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mockup E2E', type: 'mockup' }),
    });
    const projectId = createdProject.json?.data?.project?.id;
    record('project-create', Boolean(projectId), projectId || createdProject.json?.error?.message);
    const savedProject = await api(page, `/api/v1/mockups/${composite.id}/save-project`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
    record(
      'save-project',
      savedProject.status === 201 && (savedProject.json?.data?.project?.assets?.length ?? 0) >= 1,
      `status=${savedProject.status} assets=${savedProject.json?.data?.project?.assets?.length}`
    );

    console.log('\n== Phase E: Lifestyle blocked on POST ==');
    const lifestyleDirect = await api(page, '/api/v1/mockups', {
      method: 'POST',
      body: JSON.stringify({
        category: 'mug',
        colorId: 'black',
        modelLabel: 'Classic 11oz',
        placement: 'front',
        scalePercent: 100,
        designUrl: TINY_PNG,
        lifestyle: true,
      }),
    });
    record(
      'lifestyle-post-rejected',
      lifestyleDirect.status === 400 && lifestyleDirect.json?.error?.code === 'LIFESTYLE_REQUIRES_QUOTE',
      `status=${lifestyleDirect.status} code=${lifestyleDirect.json?.error?.code}`
    );
    const coinsAfterReject = await coins(page);
    record('lifestyle-post-no-debit', coinsAfterReject === coinsStart, `coins=${coinsAfterReject}`);

    console.log('\n== Phase E: Open studio is not a quote ==');
    await page.getByRole('button', { name: 'Neue Unterhaltung' }).first().click();
    await page.waitForTimeout(800);
    await sendChat(page, 'Öffne das Mockup Studio.');
    const afterOpen = await panelText(page);
    const createAfterOpen = await page.getByRole('button', { name: /Erstellen/, disabled: false }).count();
    record(
      'open-studio-no-quote',
      createAfterOpen === 0,
      `erstellen=${createAfterOpen} ${afterOpen.slice(-120).replace(/\s+/g, ' ')}`
    );

    console.log('\n== Phase E: Nexter lifestyle quote → cancel ==');
    await page.getByTestId('mockup-nexter-chip').click();
    const createBtn = page.getByRole('button', { name: /Erstellen/ }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    const quoteLabel = await createBtn.innerText();
    record('nexter-mockup-quote', /8/.test(quoteLabel), quoteLabel);
    record(
      'quote-mentions-lifestyle',
      /Lifestyle-Mockup|8 Coins|Erstellen/i.test(await panelText(page)),
      (await panelText(page)).slice(-180).replace(/\s+/g, ' ')
    );

    await page.getByRole('button', { name: 'Abbrechen' }).first().click();
    await page.waitForTimeout(800);
    const afterCancel = await panelText(page);
    const coinsAfterCancel = await coins(page);
    record(
      'quote-cancel',
      /nichts wurde gestartet|keine coins/i.test(afterCancel) && coinsAfterCancel === coinsStart,
      `coins=${coinsAfterCancel} ${afterCancel.slice(-120).replace(/\s+/g, ' ')}`
    );

    console.log('\n== Phase E: Confirm without keys fails honestly + refund ==');
    await sendChat(page, 'Zeig mir eine schwarze Tasse als Lifestyle-Foto');
    const sessionRes = await api(page, '/api/v1/nexter/session');
    const msgs = sessionRes.json?.data?.session?.messages ?? [];
    const quoted = [...msgs].reverse().find((m) =>
      (m.actions ?? []).some((a) => a.tool === 'start_generation' && a.payload?.quoteId)
    );
    const quoteId = quoted?.actions?.find((a) => a.tool === 'start_generation')?.payload?.quoteId;
    record('lifestyle-quote-id', Boolean(quoteId), String(quoteId ?? 'none'));
    const confirm = quoteId
      ? await api(page, `/api/v1/nexter/quotes/${quoteId}/confirm`, { method: 'POST' })
      : { status: 0, json: {} };
    const confirmMsg = [
      confirm.json?.error?.message,
      confirm.json?.data?.session?.messages?.at?.(-1)?.content,
      JSON.stringify(confirm.json?.error ?? ''),
    ]
      .filter(Boolean)
      .join(' ');
    const coinsAfterConfirm = await coins(page);
    const spent = coinsStart - coinsAfterConfirm;
    const failedHonestly =
      confirm.status >= 400 &&
      spent === 0 &&
      /fehlgeschlagen|erstattet|OPENAI|Provider|nicht konfiguriert|DNA|Coins/i.test(confirmMsg);
    const succeededPaid = confirm.status === 200 && spent === 8;
    record(
      'lifestyle-confirm-honest',
      failedHonestly || succeededPaid,
      `status=${confirm.status} spent=${spent} msg=${confirmMsg.slice(0, 220)}`
    );
    record(
      'lifestyle-coins-gate',
      spent === 0 || spent === 8,
      `start=${coinsStart} after=${coinsAfterConfirm}`
    );

    console.log('\n== Phase E: Isolation ==');
    const loginB = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'User B Mockup' }),
      });
      return res.json();
    });
    const tokenB = loginB?.data?.token;
    const steal = await page.evaluate(
      async ({ tokenB, jobId }) => {
        const list = await fetch('/api/v1/mockups', {
          headers: { Authorization: `Bearer ${tokenB}` },
        });
        const listJson = await list.json().catch(() => ({}));
        const one = await fetch(`/api/v1/mockups/${jobId}/save-file`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenB}` },
        });
        const oneJson = await one.json().catch(() => ({}));
        return {
          listStatus: list.status,
          jobs: listJson?.data?.jobs ?? [],
          stealStatus: one.status,
          stealCode: oneJson?.error?.code,
        };
      },
      { tokenB, jobId: composite.id }
    );
    const bHasA = steal.jobs.some((j) => j.id === composite.id);
    record(
      'isolation-list',
      steal.listStatus === 200 && !bHasA,
      `User B jobs=${steal.jobs.length} stoleA=${bHasA}`
    );
    record(
      'isolation-save-file',
      steal.stealStatus === 404 || steal.stealCode === 'NOT_FOUND',
      `status=${steal.stealStatus} code=${steal.stealCode}`
    );
  } catch (err) {
    record('uncaught', false, err instanceof Error ? err.stack : String(err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.ok === false);
  const passed = results.filter((r) => r.ok);
  console.log(`\n== Phase E Summary: ${passed.length} passed, ${failed.length} failed, ${results.length} total ==`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(`  - ${f.id}: ${f.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
