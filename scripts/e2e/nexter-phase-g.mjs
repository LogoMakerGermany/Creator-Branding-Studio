/**
 * Phase G local acceptance: Social & Text Content Studio.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-g.mjs
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
      primaryColors: ['#1E40AF', '#7C3AED'],
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
  page.setDefaultTimeout(30000);

  try {
    console.log('\n== Phase G: Login / DNA / Text Studio ==');
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page);
    record('login', page.url().includes('/dashboard'), page.url());

    const dna = await ensureDna(page);
    record('dna-ready', Boolean(dna?.name), dna?.name || 'keine DNA');
    const coinsStart = await coins(page);
    record('coins-start', coinsStart >= 2, `coins=${coinsStart}`);

    const project = await api(page, '/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'G Wolf Launch', type: 'social', dnaId: dna?.id }),
    });
    const projectId = project.json?.data?.project?.id;
    record('own-project', project.status < 300 && Boolean(projectId), projectId || String(project.status));

    const foreign = await api(page, '/api/v1/text/draft', {
      method: 'POST',
      body: JSON.stringify({ topic: 'x', projectId: 'does-not-exist-user-b', sourceType: 'project' }),
    });
    record(
      'foreign-project-rejected',
      foreign.status === 404 || foreign.status === 403,
      `status=${foreign.status} code=${foreign.json?.error?.code}`
    );

    await page.locator('aside nav a', { hasText: 'Text Studio' }).first().click();
    await page.waitForURL(/\/text-studio/);
    record('text-studio-page', page.url().includes('/text-studio'), page.url());

    const directText = await api(page, '/api/v1/text', {
      method: 'POST',
      body: JSON.stringify({ kind: 'hook', topic: 'raid' }),
    });
    record(
      'text-post-requires-quote',
      directText.status === 400 && directText.json?.error?.code === 'TEXT_REQUIRES_QUOTE',
      `status=${directText.status} code=${directText.json?.error?.code}`
    );
    record('text-post-no-debit', (await coins(page)) === coinsStart, 'kein Coin-Abzug');

    await page.waitForTimeout(800);
    await page.getByTestId('text-topic').fill('Raid Night Setup');
    await page.getByTestId('text-studio-generate').click({ force: true });
    await page.getByTestId('text-quote-bar').waitFor({ state: 'visible', timeout: 15000 });
    const quoteLabel = await page.getByTestId('text-quote-cost').innerText();
    record('text-quote-2-coins', /2/.test(quoteLabel), quoteLabel);
    record('quote-no-job-yet', (await coins(page)) === coinsStart, 'Coins unverändert vor Confirm');

    await page.getByTestId('text-studio-cancel').click();
    await page.waitForTimeout(600);
    record('quote-cancel-no-coins', (await coins(page)) === coinsStart, 'Cancel ohne Abbuchung');

    await page.getByTestId('text-studio-generate').click();
    await page.getByTestId('text-quote-bar').waitFor({ state: 'visible' });
    const beforeConfirm = await coins(page);
    await page.getByTestId('text-studio-confirm').click();
    await page.waitForTimeout(2500);
    const afterConfirm = await coins(page);
    const listed = await api(page, '/api/v1/text');
    const jobs = listed.json?.data?.jobs ?? [];
    const failedAi = /OPENAI_API_KEY|nicht konfiguriert|AI_NOT_CONFIGURED|erstattet/i.test(
      (await page.locator('body').innerText()) || ''
    );
    if (jobs[0]?.hook || jobs[0]?.title || jobs[0]?.caption) {
      record('confirm-package', true, jobs[0].title || jobs[0].hook);
      record('confirm-spent-or-refund', afterConfirm === beforeConfirm - 2 || afterConfirm === beforeConfirm, `coins ${beforeConfirm}→${afterConfirm}`);
    } else {
      record('confirm-missing-key-or-error', failedAi || afterConfirm === beforeConfirm || afterConfirm === beforeConfirm - 2, `coins ${beforeConfirm}→${afterConfirm}`);
      record('no-fake-dev-content', !/Dev\] Videotitel|DEV PLACEHOLDER/.test(JSON.stringify(jobs)), 'kein Dev-Fallback als Erfolg');
      const cancelBtn = page.getByTestId('text-studio-cancel');
      if ((await cancelBtn.count()) > 0) {
        await cancelBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
    }

    console.log('\n== Phase G: persist draft / reload ==');
    await page.getByTestId('text-topic').fill('Persist Hook Test');
    await page.getByTestId('text-studio-draft').click({ force: true });
    await page.getByTestId('content-package').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('content-hook').fill('Drei zwei eins Hook');
    await page.getByTestId('content-title').fill('NightWolf Titel');
    await page.getByTestId('content-caption').fill('Kurze Caption');
    await page.getByTestId('content-hashtags').fill('NightWolf gaming');
    await page.getByTestId('content-callToAction').fill('Jetzt folgen');
    await page.getByTestId('content-save').click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByTestId('content-hook').waitFor({ state: 'visible', timeout: 15000 });
    const hookAfter = await page.getByTestId('content-hook').inputValue();
    const captionAfter = await page.getByTestId('content-caption').inputValue();
    const tagsAfter = await page.getByTestId('content-hashtags').inputValue();
    record('persist-hook', hookAfter.includes('Drei zwei eins'), hookAfter.slice(0, 40));
    record('persist-caption', captionAfter.includes('Kurze Caption'), captionAfter.slice(0, 40));
    record('persist-hashtags', /NightWolf/i.test(tagsAfter), tagsAfter);

    console.log('\n== Phase G: Shorts → Content link / Social planner ==');
    await page.locator('aside nav a', { hasText: 'Shorts Studio' }).first().click();
    await page.waitForURL(/\/shorts-studio/);
    await page.getByTestId('shorts-create-content').waitFor({ state: 'attached', timeout: 15000 });
    record('shorts-content-cta', (await page.getByTestId('shorts-create-content').count()) > 0, 'Content erstellen');
    await page.getByTestId('shorts-create-content').click({ force: true });
    await page.waitForURL(/\/text-studio/);
    record('shorts-to-text', page.url().includes('/text-studio') && /source=short/.test(page.url()), page.url());

    await page.locator('aside nav a', { hasText: 'Social Studio' }).first().click();
    await page.waitForURL(/\/social-studio/);
    record('social-studio', page.url().includes('/social-studio'), page.url());
    record('no-fake-connect', (await page.getByText(/TikTok verbinden|Instagram verbinden|YouTube verbinden/i).count()) === 0, 'keine Fake-OAuth-Buttons');
    await page.getByTestId('publishing-unavailable').waitFor({ state: 'attached', timeout: 10000 });
    record('publishing-unavailable', (await page.getByTestId('publishing-unavailable').count()) > 0, 'Hinweis sichtbar');
    record('no-platform-analytics', (await page.getByTestId('no-platform-analytics').count()) > 0, 'Keine Plattformdaten');
    record('no-zero-likes', (await page.getByText(/0 Likes|0 Views|0 Kommentare/i).count()) === 0, 'keine Fake-Analytics');

    await page.getByText('Interner Planer', { exact: true }).click();
    await page.getByTestId('planner-datetime').fill('2026-09-01T18:00');
    await page.getByTestId('planner-save-draft').click();
    await page.waitForTimeout(700);
    await page.getByTestId('planner-schedule').click();
    await page.waitForTimeout(900);
    const plannerStatus = await page.getByTestId('planner-status').first().innerText().catch(() => '');
    record('planner-internal', /Intern geplant|Entwurf/.test(plannerStatus), plannerStatus);
    record('not-externally-published', !/Auf TikTok veröffentlicht|erfolgreich veröffentlicht/i.test(await page.locator('body').innerText()), 'kein Fake-Publish');

    await page.reload();
    await page.getByText('Interner Planer', { exact: true }).click();
    const afterReload = await page.getByTestId('planner-status').first().innerText().catch(() => '');
    record('planner-persist', /Intern geplant|Entwurf/.test(afterReload), afterReload);

    await page.goto(BASE + '/content-calendar');
    record('calendar-internal', /intern/i.test(await page.locator('h1').innerText()), await page.locator('h1').innerText());

    console.log('\n== Phase G: Nexter orchestration ==');
    await page.goto(BASE + '/text-studio');
    const openChat = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Öffne das Text Studio.', path: '/text-studio' }),
    });
    const openMsg = openChat.json?.data?.session?.messages?.slice(-1)[0];
    const openHasQuote = (openMsg?.actions ?? []).some((a) => a.tool === 'start_generation');
    const openHasNav = (openMsg?.actions ?? []).some((a) => a.tool === 'open_studio' && /text-studio/.test(a.path || ''));
    record('open-text-no-quote', !openHasQuote, `quote=${openHasQuote}`);
    record('open-text-nav', openHasNav || /Studio/i.test(openMsg?.content || ''), (openMsg?.content || '').slice(0, 120));

    const tiktokChat = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Mach mir einen TikTok-Text für meinen letzten Short.', path: '/text-studio' }),
    });
    const tiktokMsg = tiktokChat.json?.data?.session?.messages?.slice(-1)[0];
    const tiktokQuote = (tiktokMsg?.actions ?? []).some((a) => a.tool === 'start_generation');
    const tiktokNoShort = /kein eigenes Short|Textjob wurde gestartet/i.test(tiktokMsg?.content || '');
    record('nexter-tiktok-text-handled', tiktokQuote || tiktokNoShort, (tiktokMsg?.content || '').slice(0, 180));
    record('nexter-no-auto-job', (await coins(page)) >= coinsStart - 4, `coins=${await coins(page)}`);
    record('nexter-no-publish-claim', !/auf TikTok veröffentlicht|hochgeladen/i.test(tiktokMsg?.content || ''), 'kein Publish-Claim');

    const pubChat = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Veröffentliche das auf TikTok', path: '/text-studio' }),
    });
    const pubMsg = pubChat.json?.data?.session?.messages?.slice(-1)[0];
    const pubQuote = (pubMsg?.actions ?? []).some((a) => a.tool === 'start_generation');
    record(
      'nexter-blocks-publish',
      !pubQuote && /nicht verfügbar|intern geplant|nicht automatisch/i.test(pubMsg?.content || ''),
      (pubMsg?.content || '').slice(0, 160)
    );

    const graphicDirect = await api(page, '/api/v1/social-studio', {
      method: 'POST',
      body: JSON.stringify({ format: 'thumbnail' }),
    });
    record(
      'graphic-requires-quote',
      graphicDirect.status === 400 && graphicDirect.json?.error?.code === 'SOCIAL_GRAPHIC_REQUIRES_QUOTE',
      graphicDirect.json?.error?.code
    );

    console.log('\n== Phase G: mobile viewport ==');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/text-studio');
    await page.getByTestId('text-studio-generate').waitFor({ state: 'attached', timeout: 15000 });
    await page.getByTestId('text-studio-generate').scrollIntoViewIfNeeded();
    record('mobile-text', (await page.getByTestId('text-studio-generate').count()) > 0, 'Generate sichtbar');
    await page.goto(BASE + '/social-studio');
    await page.getByTestId('publishing-unavailable').waitFor({ state: 'attached', timeout: 15000 });
    record('mobile-social', (await page.getByTestId('publishing-unavailable').count()) > 0, 'Hinweis mobil');
  } catch (err) {
    record('fatal', false, err instanceof Error ? err.message : String(err));
  } finally {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nPhase G: ${passed}/${results.length} passed, ${failed} failed`);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
}

main();
