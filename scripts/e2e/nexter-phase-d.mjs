/**
 * Phase D local acceptance: Streamset Studio as a real pack over existing generators.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-d.mjs
 */
import { chromium } from 'playwright';
import { completeOnboardingIfNeeded } from './onboarding-helper.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const results = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${id}${detail ? ` — ${detail}` : ''}`);
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

async function sendChat(page, text) {
  const input = page.getByPlaceholder('Frag Nexter…').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await page
    .getByText(/Hallo, ich bin Nexter|Dein KI-Creator/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => undefined);
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
  page.setDefaultTimeout(25000);

  try {
    console.log('\n== Phase D: Login → DNA → Streamset Studio ==');
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByRole('button', { name: /Dev-Login/ }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page);
    record('login', page.url().includes('/dashboard'), page.url());

    const dna = await ensureDna(page);
    record('dna-ready', Boolean(dna?.name), dna?.name || 'keine DNA');

    const meStart = await api(page, '/api/v1/auth/me');
    const coinsStart = meStart.json?.data?.user?.coinBalance ?? 0;
    record('coins-start', coinsStart >= 50, `coins=${coinsStart}`);

    await page.locator('aside nav a', { hasText: 'Streamset Studio' }).first().click();
    await page.waitForURL(/\/streamset-studio/);
    record('streamset-page', page.url().includes('/streamset-studio'), page.url());

    await page.getByTestId('streamset-wizard').waitFor({ state: 'visible', timeout: 10000 });
    record('wizard-visible', await page.getByTestId('streamset-wizard').isVisible(), 'Wizard');

    await page.getByTestId('streamset-dna-name').getByText(/NightWolf/i).waitFor({ timeout: 15000 });
    const dnaLabel = await page.getByTestId('streamset-dna-name').innerText();
    record('dna-bound', /NightWolf/i.test(dnaLabel), dnaLabel.slice(0, 160));

    await page.getByTestId('streamset-missing').getByText(/Starting Soon/i).waitFor({ timeout: 10000 });
    const missingText = await page.getByTestId('streamset-missing').innerText();
    record(
      'checklist-missing',
      /Starting Soon|BRB|Offline|HUD|Facecam|Banner/i.test(missingText),
      missingText.slice(0, 240)
    );

    const packBtn = page.getByTestId('streamset-pack');
    const packLabel = await packBtn.innerText();
    record('pack-cost-50', /50/.test(packLabel), packLabel);

    await page.getByTestId('streamset-tab-screens').click();
    record(
      'tab-screens',
      await page.getByTestId('streamset-asset-starting-soon').isVisible(),
      'Starting Soon in Screens'
    );
    record('tab-brb', await page.getByTestId('streamset-asset-brb').isVisible(), 'BRB');
    record('tab-just-chatting', await page.getByTestId('streamset-asset-just-chatting').isVisible(), 'Just Chatting');

    await page.getByTestId('streamset-tab-overlays').click();
    record('tab-overlays', await page.getByTestId('streamset-asset-hud').isVisible(), 'HUD');
    record('tab-alert', await page.getByTestId('streamset-asset-alert').isVisible(), 'Alert');

    await page.getByTestId('streamset-tab-banner').click();
    record('tab-banner', await page.getByTestId('streamset-asset-twitch-banner').isVisible(), 'Twitch Banner');
    record('tab-youtube', await page.getByTestId('streamset-asset-youtube-banner').isVisible(), 'YouTube Banner');

    await page.getByTestId('streamset-tab-facecam').click();
    record('tab-facecam', await page.getByTestId('streamset-asset-facecam').isVisible(), 'Facecam');

    await page.getByTestId('streamset-tab-sticker').click();
    record('tab-sticker', await page.getByTestId('streamset-asset-sticker').isVisible(), 'Sticker');

    record('tab-intro-link', await page.getByTestId('streamset-tab-intro').isVisible(), 'Intro/Outro Link');

    const statusRes = await api(page, '/api/v1/streamset/status');
    const assets = statusRes.json?.data?.assets ?? [];
    record(
      'status-catalog-12',
      statusRes.status === 200 && assets.length === 12,
      `status=${statusRes.status} assets=${assets.length} cost=${statusRes.json?.data?.packCoinCost}`
    );
    record(
      'status-dna',
      statusRes.json?.data?.dna?.name === 'NightWolf',
      JSON.stringify(statusRes.json?.data?.dna)
    );

    console.log('\n== Phase D: Pack fail/refund (no fake images) ==');
    await page.getByTestId('streamset-tab-screens').click();
    await packBtn.click();
    await page
      .getByText(/fehlgeschlagen|erstattet|nicht konfiguriert|kein Provider/i)
      .first()
      .waitFor({ timeout: 120000 })
      .catch(() => undefined);
    const afterPack = await page.locator('body').innerText();
    const mePack = await api(page, '/api/v1/auth/me');
    const coinsPack = mePack.json?.data?.user?.coinBalance;
    record(
      'pack-honest-fail',
      /fehlgeschlagen|erstattet|nicht konfiguriert|Provider/i.test(afterPack),
      afterPack.slice(0, 280).replace(/\s+/g, ' ')
    );
    record(
      'pack-coins-refunded',
      coinsPack === coinsStart,
      `start=${coinsStart} afterPack=${coinsPack}`
    );
    record(
      'pack-no-fake-grid',
      (await page.getByTestId('streamset-results').locator('img').count()) === 0,
      'keine Fake-Bilder'
    );

    await page.getByTestId('streamset-asset-starting-soon').click();
    await page
      .getByText(/fehlgeschlagen|erstattet|nicht konfiguriert|kein Provider/i)
      .first()
      .waitFor({ timeout: 60000 })
      .catch(() => undefined);
    const meAsset = await api(page, '/api/v1/auth/me');
    const coinsAsset = meAsset.json?.data?.user?.coinBalance;
    record(
      'single-asset-refund',
      coinsAsset === coinsStart,
      `after single overlay: ${coinsAsset}`
    );

    console.log('\n== Phase D: Nexter quote after streamset intent ==');
    await sendChat(page, 'Soll ich dir daraus ein vollständiges Streamset erstellen?');
    const createBtn = page.getByRole('button', { name: /Erstellen/ }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 12000 });
    const quoteLabel = await createBtn.innerText();
    record('nexter-streamset-quote', /50/.test(quoteLabel), quoteLabel);

    const jobsBefore = await api(page, '/api/v1/nexter/context');
    const jobCountBefore = jobsBefore.json?.data?.context?.recentJobs?.length ?? 0;
    record('quote-no-job-yet', true, `recentJobs=${jobCountBefore}`);

    await page.getByRole('button', { name: 'Abbrechen' }).first().click();
    await page.waitForTimeout(800);
    const afterCancel = await panelText(page);
    record(
      'streamset-quote-cancel',
      /nichts wurde gestartet|keine coins/i.test(afterCancel),
      afterCancel.slice(-160)
    );

    console.log('\n== Phase D: Isolation ==');
    const loginB = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'User B Streamset' }),
      });
      return res.json();
    });
    const tokenB = loginB?.data?.token;
    const steal = await page.evaluate(
      async (tokenB) => {
        const res = await fetch('/api/v1/streamset/status', {
          headers: { Authorization: `Bearer ${tokenB}` },
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, json };
      },
      tokenB
    );
    const bAssets = steal.json?.data?.assets ?? [];
    const bPresent = bAssets.filter((a) => a.present).length;
    record(
      'isolation-user-b-empty',
      steal.status === 200 && bPresent === 0,
      `User B present=${bPresent} missing=${steal.json?.data?.missing?.length}`
    );
  } catch (err) {
    record('uncaught', false, err instanceof Error ? err.stack : String(err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.ok === false);
  const passed = results.filter((r) => r.ok);
  console.log(`\n== Phase D Summary: ${passed.length} passed, ${failed.length} failed, ${results.length} total ==`);
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
