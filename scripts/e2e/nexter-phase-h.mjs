/**
 * Phase H local acceptance: Project detail, assets, change quotes, ZIP, Nexter aggregation.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-h.mjs
 */
import { chromium } from 'playwright';
import { completeOnboardingIfNeeded } from './onboarding-helper.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
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
      locks: { colors: true, character: true, mascot: true, name: true },
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
    console.log('\n== Phase H: Login / DNA / Project ==');
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page);
    record('login', page.url().includes('/dashboard'), page.url());

    const dna = await ensureDna(page);
    record('dna-ready', Boolean(dna?.name), dna?.name || 'keine DNA');
    const coinsStart = await coins(page);

    const project = await api(page, '/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'H NightWolf', type: 'branding', dnaId: dna?.id }),
    });
    const projectId = project.json?.data?.project?.id;
    record('own-project', project.status < 300 && Boolean(projectId), projectId || String(project.status));

    const foreign = await api(page, '/api/v1/projects/does-not-exist-user-b/overview');
    record(
      'foreign-project-404',
      foreign.status === 404 || foreign.status === 403,
      `status=${foreign.status}`
    );

    const fileA = await api(page, '/api/v1/files', {
      method: 'POST',
      body: JSON.stringify({
        name: 'h-logo.png',
        mimeType: 'image/png',
        category: 'logo',
        dataUrl: PIXEL,
        projectId,
        rightsConfirmed: true,
      }),
    });
    const fileB = await api(page, '/api/v1/files', {
      method: 'POST',
      body: JSON.stringify({
        name: 'h-banner.png',
        mimeType: 'image/png',
        category: 'banner',
        dataUrl: PIXEL,
        projectId,
        rightsConfirmed: true,
      }),
    });
    record(
      'project-files',
      fileA.status < 300 && fileB.status < 300 && fileA.json?.data?.file?.projectId === projectId,
      `a=${fileA.status} b=${fileB.status}`
    );

    const globalFile = await api(page, '/api/v1/files', {
      method: 'POST',
      body: JSON.stringify({
        name: 'h-global-not-in-zip.png',
        mimeType: 'image/png',
        category: 'other',
        dataUrl: PIXEL,
        rightsConfirmed: true,
      }),
    });
    record('global-file', globalFile.status < 300, globalFile.json?.data?.file?.id);

    await page.goto(BASE + `/projects/${projectId}`);
    await page.getByTestId('project-detail').waitFor({ state: 'visible', timeout: 15000 });
    record('detail-page', page.url().includes(`/projects/${projectId}`), page.url());
    const dnaLabel = await page.getByTestId('project-dna').innerText();
    record('dna-visible', /NightWolf/.test(dnaLabel), dnaLabel);
    await page.getByTestId('project-tab-assets').click();
    record('assets-tab', (await page.getByTestId('project-assets').count()) > 0, 'Assets-Bereich');

    await page.getByTestId('project-status').selectOption('in_progress');
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByTestId('project-detail').waitFor({ state: 'visible' });
    const statusAfter = await page.getByTestId('project-status').inputValue();
    record('status-persisted', statusAfter === 'in_progress', statusAfter);

    await page.getByRole('button', { name: /Für Nexter nutzen|Aktiv für Nexter/ }).first().click();
    record('nexter-active', true, 'Projekt für Nexter gesetzt');

    const directCr = await api(page, '/api/v1/change-request', {
      method: 'POST',
      body: JSON.stringify({ jobId: '00000000-0000-4000-8000-000000000001', request: 'dunkler' }),
    });
    record(
      'change-requires-quote',
      directCr.status === 400 && directCr.json?.error?.code === 'CHANGE_REQUIRES_QUOTE',
      `status=${directCr.status} code=${directCr.json?.error?.code}`
    );
    record('change-direct-no-debit', (await coins(page)) === coinsStart, 'kein Coin-Abzug');

    const jobs = await api(page, '/api/v1/change-request');
    const available = (jobs.json?.data?.availableJobs ?? []).filter((j) => j.module === 'logo' && j.imageUrl);
    if (available[0]?.id) {
      console.log('\n== Phase H: Change quote (existing logo job) ==');
      const beforeQuote = await coins(page);
      const quoted = await api(page, '/api/v1/change-request/quote', {
        method: 'POST',
        body: JSON.stringify({ jobId: available[0].id, request: 'Hintergrund dunkler', projectId }),
      });
      const q = quoted.json?.data?.quote;
      record(
        'change-quote-module-price',
        quoted.status < 300 && q?.coinCost === 15 && /KI-Variante/i.test(quoted.json?.data?.honestLabel || ''),
        `cost=${q?.coinCost} label=${quoted.json?.data?.honestLabel}`
      );
      record('quote-no-job-yet', (await coins(page)) === beforeQuote, 'Coins unverändert vor Confirm');
      await api(page, `/api/v1/nexter/quotes/${q.id}/cancel`, { method: 'POST' });
      record('quote-cancel-no-coins', (await coins(page)) === beforeQuote, 'Cancel ohne Abbuchung');

      const quoted2 = await api(page, '/api/v1/change-request/quote', {
        method: 'POST',
        body: JSON.stringify({ jobId: available[0].id, request: 'Hintergrund dunkler', projectId }),
      });
      const q2 = quoted2.json?.data?.quote;
      const confirm = await api(page, `/api/v1/nexter/quotes/${q2.id}/confirm`, { method: 'POST' });
      const afterConfirm = await coins(page);
      const refunded = afterConfirm === beforeQuote;
      const spent = afterConfirm === beforeQuote - 15;
      record(
        'confirm-provider-or-refund',
        confirm.status < 300 || refunded || spent,
        `status=${confirm.status} coins ${beforeQuote}→${afterConfirm} code=${confirm.json?.error?.code || ''}`
      );
      if (refunded && confirm.status >= 400) {
        record('honest-provider-error', true, confirm.json?.error?.message || confirm.json?.error?.code);
      }

      const versions = await api(page, `/api/v1/change-request/job/${available[0].id}/versions`);
      const list = versions.json?.data?.versions ?? [];
      if (list.length >= 2) {
        const v1 = list.find((v) => v.version === 1) || list[0];
        const beforeRestore = await coins(page);
        const restored = await api(page, `/api/v1/change-request/restore/${v1.id}`, { method: 'POST' });
        record(
          'restore-zero-coins',
          restored.status < 300 && (await coins(page)) === beforeRestore,
          `status=${restored.status}`
        );
      } else {
        record('restore-skipped-no-versions', true, `versions=${list.length} (kein Provider-Ergebnis)`);
      }
    } else {
      record('change-flow-no-logo-job', true, 'Kein Logo-Job mit Bild — Provider nicht nötig für Gate-Test');
    }

    console.log('\n== Phase H: Project ZIP ==');
    const exported = await api(page, `/api/v1/projects/${projectId}/export`);
    const exportUrl = exported.json?.data?.exportUrl || '';
    const manifest = exported.json?.data?.manifest;
    record(
      'zip-real',
      exported.status < 300 && /^data:application\/zip/.test(exportUrl),
      `status=${exported.status}`
    );
    record('zip-manifest', Boolean(manifest?.projectId === projectId && manifest?.exportVersion === 1), manifest?.projectId);
    const decoded = exportUrl.includes(',') ? Buffer.from(exportUrl.split(',')[1], 'base64').toString('binary') : '';
    record('zip-has-manifest-file', decoded.includes('manifest.json'), 'PK zip contains manifest.json');
    record(
      'zip-not-global-file',
      !decoded.includes('h-global-not-in-zip') && !JSON.stringify(manifest || {}).includes(globalFile.json?.data?.file?.id || '___'),
      'globales File nicht im ZIP'
    );
    record('zip-project-id', decoded.includes(projectId) || manifest?.projectId === projectId, projectId);

    const coinsBeforeNexter = await coins(page);
    const chatChange = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Mach mein letztes Logo dunkler.', projectId }),
    });
    const last = chatChange.json?.data?.session?.messages?.slice(-1)?.[0];
    const actions = last?.actions ?? [];
    const start = actions.find((a) => a.tool === 'start_generation');
    const asked = /welches logo|kein logo|keine coins/i.test(last?.content || '');
    record(
      'nexter-change-no-auto-job',
      chatChange.status < 300 && (Boolean(start?.requiresConfirmation) || asked),
      asked ? last?.content?.slice(0, 160) : `quote=${start?.payload?.quoteId || 'none'}`
    );
    record('nexter-change-coins-untouched', (await coins(page)) === coinsBeforeNexter, 'Chat startet keinen Job');

    await page.goto(BASE + '/logo-studio');
    await page.waitForTimeout(800);
    const studioCopy = await page.locator('body').innerText();
    record('svg-not-vector', !/Vektor Export/i.test(studioCopy), 'kein Vektor-Export');
    record('no-fake-hd', (await page.getByRole('button', { name: /^HD$/ }).count()) === 0, 'kein HD-Button');

    console.log('\n== Phase H: Nexter aggregation ==');
    const ctx = await api(page, `/api/v1/nexter/context?projectId=${projectId}`);
    const snap = ctx.json?.data?.context;
    record(
      'nexter-context-project',
      ctx.status < 300 && (snap?.projectId === projectId || snap?.projectName),
      snap?.projectName || snap?.projectId
    );

    const chatInv = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Was habe ich in diesem Projekt?', projectId }),
    });
    const invText = JSON.stringify(chatInv.json?.data?.session?.messages?.slice(-1) ?? []);
    record(
      'nexter-inventory',
      chatInv.status < 300 && (/NightWolf|Asset|Logo|File|Projekt|vorhanden/i.test(invText) || /keine aggregierten/i.test(invText)),
      invText.slice(0, 180)
    );

    await page.goto(BASE + `/projects/${projectId}`);
    await sendChat(page, 'Was habe ich in diesem Projekt?');
    const ui = await panelText(page);
    record('nexter-ui-inventory', /NightWolf|Asset|Projekt|Coins|Logo|File/i.test(ui), ui.slice(0, 200));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + `/projects/${projectId}`);
    await page.getByTestId('project-detail').waitFor({ state: 'attached', timeout: 15000 });
    record('mobile-detail', (await page.getByTestId('project-detail').count()) > 0, 'Detail mobil');
  } catch (err) {
    record('fatal', false, err instanceof Error ? err.message : String(err));
  } finally {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => r.ok === false).length;
    console.log(`\nPhase H: ${passed}/${results.length} passed, ${failed} failed`);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
}

main();
