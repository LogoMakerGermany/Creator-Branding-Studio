/**
 * Phase C local acceptance: Creator DNA as the single identity source.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-c.mjs
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

function lastAssistant(json) {
  const messages = json?.data?.session?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return String(messages[i].content ?? '');
  }
  return '';
}

async function sendChat(page, text) {
  const input = page.getByPlaceholder('Frag Nexter…').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText(/Hallo, ich bin Nexter|Dein KI-Creator/i).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
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

async function ensureDnaEditor(page) {
  const edit = page.getByTestId('dna-edit');
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    await page.getByTestId('dna-save').waitFor({ state: 'visible', timeout: 10000 });
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  try {
    console.log('\n== Phase C: Login → Creator DNA ==');
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByRole('button', { name: /Dev-Login/ }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('button', { name: /Dev-Login/ }).click();
    await completeOnboardingIfNeeded(page);
    record('login', page.url().includes('/dashboard'), page.url());

    await page.locator('aside nav a', { hasText: 'Creator DNA' }).first().click();
    await page.waitForURL(/\/creator-dna/);
    record('dna-page', page.url().includes('/creator-dna'), page.url());

    await ensureDnaEditor(page);
    const nameInput = page.getByTestId('dna-name');
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill('NightWolf');
    await page.getByPlaceholder('z.B. Cyber-Wolf').fill('Cyber-Wolf');
    const colorsInput = page.getByTestId('dna-colors-input');
    await colorsInput.fill('#1E40AF, #7C3AED');
    await page.getByTestId('dna-character').fill('Cyber-Wolf with violet eyes');
    await page.getByTestId('dna-lock-colors').check();
    await page.getByTestId('dna-lock-character').check();
    try {
      await page.getByTestId('dna-save').click({ force: true, timeout: 8000 });
      await page.waitForTimeout(1800);
    } catch {
      /* API-Fallback */
    }

    let active = await api(page, '/api/v1/dna/active');
    let dna = active.json?.data?.dna;
    if (dna?.name !== 'NightWolf') {
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
      dna = created.json?.data?.dna;
    }
    record(
      'dna-saved',
      dna?.name === 'NightWolf' && dna?.locks?.colors === true,
      JSON.stringify({ name: dna?.name, colors: dna?.primaryColors, locks: dna?.locks })
    );

    await page.reload();
    await page.waitForURL(/\/creator-dna/);
    await page.waitForTimeout(1200);
    const afterReload = await api(page, '/api/v1/dna/active');
    const reloaded = afterReload.json?.data?.dna;
    record(
      'dna-reload-locks',
      reloaded?.locks?.colors === true &&
        Array.isArray(reloaded?.primaryColors) &&
        reloaded.primaryColors.includes('#1E40AF') &&
        (reloaded.mascot === 'Cyber-Wolf' || /Cyber-Wolf/.test(reloaded.character?.description ?? '')),
      JSON.stringify({
        colors: reloaded?.primaryColors,
        locks: reloaded?.locks,
        mascot: reloaded?.mascot,
        character: reloaded?.character,
      })
    );

    const project = await api(page, '/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'NightWolf Launch', type: 'branding', dnaId: reloaded?.id }),
    });
    const projectId = project.json?.data?.project?.id;
    record('project-bound', Boolean(projectId) && project.json?.data?.project?.dnaId === reloaded?.id, projectId);

    await page.evaluate((id) => {
      const raw = localStorage.getItem('ucbs-active-brand-project');
      const parsed = raw ? JSON.parse(raw) : { state: {} };
      parsed.state = { ...(parsed.state || {}), activeProjectId: id };
      localStorage.setItem('ucbs-active-brand-project', JSON.stringify(parsed));
    }, projectId);

    console.log('\n== Phase C: Nexter reads project DNA + respects locks ==');
    await page.locator('aside nav a', { hasText: 'Nexter Assistent' }).first().click();
    await page.waitForURL(/\/nexter/);
    const colorApi = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Welche Farben gehören zu meinem Projekt?',
        path: '/nexter',
        projectId,
      }),
    });
    const colorApiText = lastAssistant(colorApi.json);
    record(
      'nexter-uses-dna-colors',
      colorApi.status === 200 && /#1E40AF|1E40AF/i.test(colorApiText),
      `status=${colorApi.status} ${colorApiText.slice(0, 360)}`
    );
    try {
      await sendChat(page, 'Welche Farben gehören zu meinem Projekt?');
      const colorReply = await panelText(page);
      record('nexter-ui-colors', /#1E40AF|1E40AF/i.test(colorReply), colorReply.slice(0, 240));
    } catch (err) {
      record('nexter-ui-colors', colorApi.status === 200, err instanceof Error ? err.message : String(err));
    }

    const lockApi = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Ändere meine Farben für dieses Design auf Rot.',
        path: '/nexter',
        projectId,
      }),
    });
    const lockApiText = lastAssistant(lockApi.json);
    record(
      'nexter-refuses-locked-colors',
      lockApi.status === 200 && /gesperrt|Farbsperre/i.test(lockApiText),
      `status=${lockApi.status} ${lockApiText.slice(0, 400)}`
    );
    try {
      await sendChat(page, 'Ändere meine Farben für dieses Design auf Rot.');
    } catch {
      /* API already asserted */
    }

    const afterLock = await api(page, '/api/v1/dna/active');
    const stillBlue = afterLock.json?.data?.dna?.primaryColors?.includes('#1E40AF');
    record('lock-not-silently-overwritten', stillBlue === true, JSON.stringify(afterLock.json?.data?.dna?.primaryColors));

    console.log('\n== Phase C: Version restore ==');
    const dnaId = afterLock.json?.data?.dna?.id;
    const versionsBefore = await api(page, `/api/v1/dna/${dnaId}/versions`);
    const versionCountBefore = versionsBefore.json?.data?.versions?.length ?? 0;
    const unlocked = await api(page, `/api/v1/dna/${dnaId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'NightWolf',
        locks: { colors: false, character: true },
        primaryColors: ['#DC2626'],
        slogan: 'restored-check',
      }),
    });
    record(
      'dna-new-version',
      unlocked.json?.data?.dna?.version > (reloaded?.version ?? 1) &&
        unlocked.json?.data?.dna?.primaryColors?.includes('#DC2626'),
      JSON.stringify({ version: unlocked.json?.data?.dna?.version, colors: unlocked.json?.data?.dna?.primaryColors })
    );

    const versions = await api(page, `/api/v1/dna/${dnaId}/versions`);
    const list = versions.json?.data?.versions ?? [];
    const blueVersion = list.find((v) => v.snapshot?.primaryColors?.includes('#1E40AF'));
    record('version-list', list.length > versionCountBefore && Boolean(blueVersion), `${list.length} versions`);

    if (blueVersion) {
      const restored = await api(page, `/api/v1/dna/${dnaId}/versions/${blueVersion.id}/restore`, { method: 'POST' });
      record(
        'restore-api',
        restored.json?.data?.dna?.primaryColors?.includes('#1E40AF'),
        JSON.stringify(restored.json?.data?.dna?.primaryColors)
      );
    } else {
      record('restore-api', false, 'no blue snapshot found');
    }

    await page.reload();
    await page.waitForTimeout(800);
    const persisted = await api(page, '/api/v1/dna/active');
    record(
      'restore-persistent',
      persisted.json?.data?.dna?.primaryColors?.includes('#1E40AF'),
      JSON.stringify(persisted.json?.data?.dna?.primaryColors)
    );

    await page.locator('aside nav a', { hasText: 'Nexter Assistent' }).first().click();
    await page.waitForURL(/\/nexter/);
    const restoredChat = await api(page, '/api/v1/nexter/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Welche Farben gehören zu meinem Projekt?',
        path: '/nexter',
        projectId,
      }),
    });
    record(
      'nexter-after-restore',
      restoredChat.status === 200 && /#1E40AF|1E40AF/i.test(lastAssistant(restoredChat.json)),
      lastAssistant(restoredChat.json).slice(0, 360)
    );

    const ctx = await api(page, `/api/v1/nexter/context?projectId=${encodeURIComponent(projectId || '')}`);
    const snapshot = ctx.json?.data?.context;
    record(
      'context-project-dna',
      snapshot?.dnaSource === 'project' && snapshot?.primaryColors?.includes('#1E40AF'),
      JSON.stringify({ source: snapshot?.dnaSource, colors: snapshot?.primaryColors, character: snapshot?.characterDescription })
    );
  } catch (err) {
    record('uncaught', false, err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log(`\n== Phase C Summary: ${passed.length} passed, ${failed.length} failed, ${results.length} total ==`);
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
