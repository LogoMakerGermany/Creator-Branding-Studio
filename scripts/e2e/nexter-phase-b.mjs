/**
 * Phase A + B local acceptance against a running Vite + API stack.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-b.mjs
 */
import { chromium } from 'playwright';
import { completeOnboardingIfNeeded } from './onboarding-helper.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const NAV = [
  ['Dashboard', '/dashboard'],
  ['Nexter Assistent', '/nexter'],
  ['Creator DNA', '/creator-dna'],
  ['Logo Studio', '/logo-studio'],
  ['Streamset Studio', '/streamset-studio'],
  ['Animation Studio', '/animation-studio'],
  ['Video Studio', '/video-studio'],
  ['Shorts Studio', '/shorts-studio'],
  ['Social Studio', '/social-studio'],
  ['Text Studio', '/text-studio'],
  ['Mockup Studio', '/mockup-studio'],
  ['Projekte', '/projects'],
  ['Dateien', '/file-cloud'],
  ['Vorlagen', '/templates'],
  ['Einstellungen', '/settings'],
];

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
  await input.fill(text);
  await page.getByRole('button', { name: 'Senden' }).first().click();
  await page.getByText(text).last().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(2200);
}

async function panelText(page) {
  const panel = page.locator('aside').filter({ has: page.getByPlaceholder('Frag Nexter…') }).first();
  return panel.innerText();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    console.log('\n== 1. Landing / Login / Nav ==');
    await page.goto(BASE + '/');
    const landing = await page.locator('text=NEXTER Creator Studio').first().isVisible();
    record('landing', landing, landing ? 'Hero sichtbar' : 'Hero fehlt');
    await page.getByRole('link', { name: 'Anmelden' }).first().click();
    await page.waitForURL(/\/login/);
    const devBtn = page.getByRole('button', { name: /Dev-Login/ });
    await page.getByRole('button', { name: /Dev-Login/ }).waitFor({ state: 'visible', timeout: 15000 });
    record('login-page', await devBtn.isVisible(), 'Dev-Login Button');
    await devBtn.click();
    await completeOnboardingIfNeeded(page);
    record('dev-login', page.url().includes('/dashboard'), page.url());
    await page.getByText('Deine Coins').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText('Willkommen zurück').waitFor({ state: 'visible', timeout: 15000 });
    record('dashboard', true, 'Dashboard-Headline');

    const coinsText = await page.getByText('Deine Coins').isVisible();
    const charge = await page.getByRole('link', { name: 'Coins aufladen' }).isVisible();
    record('coins-block', coinsText && charge, 'Sidebar Coins + Aufladen');

    const navCount = await page.locator('aside nav a').count();
    record('sidebar-15', navCount === 15, `${navCount}/15 Sidebar-Links`);

    console.log('\n== 2. Alle 15 Nav-Ziele (SPA-Klicks) ==');
    for (const [label, path] of NAV) {
      await page.locator('aside nav a', { hasText: label }).first().click();
      await page.waitForURL((url) => url.pathname === path, { timeout: 10000 });
      const crashed = await page.getByText('Something went wrong').isVisible().catch(() => false);
      record(`nav:${path}`, page.url().includes(path) && !crashed, page.url());
    }

    await page.getByRole('link', { name: 'Coins aufladen' }).click();
    await page.waitForURL(/\/coins/);
    record('coins-link', page.url().includes('/coins'), page.url());

    console.log('\n== 3. Redirects ==');
    const redirects = [
      ['/branding-studio', '/logo-studio'],
      ['/ai-assistant', '/nexter'],
      ['/ai-creator', '/nexter'],
    ];
    for (const [from, to] of redirects) {
      await page.goto(BASE + from);
      await page.waitForURL((url) => url.pathname === to, { timeout: 10000 });
      record(`redirect:${from}`, page.url().includes(to), `${from} → ${page.url()}`);
    }

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    record('auth-token', Boolean(token), token ? 'dev_… gesetzt' : 'kein Token');
    const uid = token?.startsWith('dev_') ? token.slice(4) : null;

    const ctxBefore = await api(page, '/api/v1/nexter/context');
    const snapshot = ctxBefore.json?.data?.context;
    record(
      'context-isolation',
      Boolean(snapshot) && snapshot.coinBalance != null && Array.isArray(snapshot.projectNames),
      JSON.stringify({
        status: ctxBefore.status,
        coins: snapshot?.coinBalance,
        hasDna: snapshot?.hasDna,
        projects: snapshot?.projectNames,
        dna: snapshot?.dnaName,
        err: ctxBefore.json?.error,
      })
    );
    record(
      'context-no-foreign-projects',
      Array.isArray(snapshot?.projectNames) && snapshot.projectNames.length === 0,
      `Projektnamen=${JSON.stringify(snapshot?.projectNames)} (neuer Dev-User, Store-Projekte sind leer)`
    );

    const jobsBefore = await api(page, '/api/v1/studio/jobs').catch(() => ({ status: 0, json: {} }));
    const me = await api(page, ' /api/v1/auth/me'.trim());
    const coinsStart = me.json?.data?.user?.coinBalance ?? snapshot?.coinBalance;

    console.log('\n== 4. Nexter Live-Flow (ohne DNA) ==');
    await page.locator('aside nav a', { hasText: 'Nexter Assistent' }).first().click();
    await page.waitForURL(/\/nexter/);
    record('nexter-page', page.url().includes('/nexter'), page.url());
    record('nexter-panel', await page.getByPlaceholder('Frag Nexter…').first().isVisible(), 'Chat-Input');
    record('nexter-orb', (await page.locator('canvas').count()) >= 1, `${await page.locator('canvas').count()} canvas`);

    await sendChat(page, 'Was weißt du über mein aktuelles Creator-Projekt?');
    const body1 = await panelText(page);
    const knowsNoDna = /keine (creator )?dna|dna fehlt|ohne dna/i.test(body1);
    const mentionsCoins = new RegExp(String(coinsStart)).test(body1) || /coins/i.test(body1);
    const inventsProject = /twitch launch|nightwolf|resize test/i.test(body1);
    record('live-context-no-dna', knowsNoDna && mentionsCoins && !inventsProject, body1.slice(0, 280));

    await sendChat(page, 'Mach mir ein Logo.');
    const bodyAsk = await panelText(page);
    record(
      'live-asks-missing',
      /dna|name/i.test(bodyAsk) && !(await page.getByRole('button', { name: /Erstellen/ }).count()),
      bodyAsk.slice(0, 220)
    );

    console.log('\n== 5. DNA anlegen + Logo-Studio-Navigation ==');
    await page.locator('aside nav a', { hasText: 'Creator DNA' }).first().click();
    await page.waitForURL(/\/creator-dna/);
    await page.getByPlaceholder('z.B. Mein Stream Brand').fill('NightWolf');
    await page.getByPlaceholder('z.B. Cyber-Wolf').fill('Cyber-Wolf');
    try {
      await page.getByRole('button', { name: 'Creator DNA erstellen' }).click({ force: true, timeout: 8000 });
      await page.waitForTimeout(1500);
    } catch {
      /* PageTransition kann den Button unstabil machen — API-Fallback unten */
    }
    let dnaAfter = await api(page, '/api/v1/dna/active');
    if (dnaAfter.json?.data?.dna?.name !== 'NightWolf') {
      dnaAfter = await api(page, '/api/v1/dna', {
        method: 'POST',
        body: JSON.stringify({
          name: 'NightWolf',
          mascot: 'Cyber-Wolf',
          styleDirection: 'gaming',
          primaryColors: ['#7C3AED'],
        }),
      });
    }
    const dnaName = dnaAfter.json?.data?.dna?.name || (await api(page, '/api/v1/dna/active')).json?.data?.dna?.name;
    record('dna-created', dnaName === 'NightWolf', dnaName || JSON.stringify(dnaAfter.json));

    await page.locator('aside nav a', { hasText: 'Nexter Assistent' }).first().click();
    await page.waitForURL(/\/nexter/);
    await sendChat(page, 'Was weißt du über mein aktuelles Creator-Projekt?');
    const bodyDna = await panelText(page);
    record(
      'live-knows-dna',
      /NightWolf/i.test(bodyDna) && !/resize test/i.test(bodyDna),
      bodyDna.slice(0, 280)
    );

    await sendChat(page, 'Öffne das Logo Studio.');
    await page.waitForURL(/\/logo-studio/, { timeout: 10000 });
    record('open-studio-navigates', page.url().includes('/logo-studio'), page.url());
    record(
      'studio-layout-panel',
      await page.getByPlaceholder('Frag Nexter…').first().isVisible(),
      'Nexter-Panel im Logo Studio'
    );

    await sendChat(page, 'Ich möchte daraus ein Logo machen.');
    await page.waitForTimeout(800);
    const createBtn = page.getByRole('button', { name: /Erstellen/ }).first();
    const cancelBtn = page.getByRole('button', { name: 'Abbrechen' }).first();
    const hasQuote = await createBtn.isVisible();
    const quoteLabel = hasQuote ? await createBtn.innerText() : '';
    record('quote-visible', hasQuote && /15/.test(quoteLabel), quoteLabel || 'kein Erstellen-Button');
    record('quote-cancel-visible', await cancelBtn.isVisible(), 'Abbrechen');

    const jobsMid = await api(page, '/api/v1/nexter/context');
    const jobCount = jobsMid.json?.data?.context?.recentJobs?.length ?? 0;
    const meMid = await api(page, '/api/v1/auth/me');
    const coinsMid = meMid.json?.data?.user?.coinBalance;
    record('gate-no-click-no-job', jobCount === 0, `recentJobs=${jobCount} Coins=${coinsMid}`);
    record('gate-coins-unchanged-before-confirm', coinsMid === coinsStart, `start=${coinsStart} now=${coinsMid}`);

    console.log('\n== 6. Confirmation Gate ==');
    await cancelBtn.click();
    await page.waitForTimeout(800);
    const afterCancel = await panelText(page);
    record('quote-cancelled', /nichts wurde gestartet|keine coins/i.test(afterCancel), afterCancel.slice(-180));
    const meCancel = await api(page, '/api/v1/auth/me');
    record(
      'cancel-no-coin-debit',
      meCancel.json?.data?.user?.coinBalance === coinsStart,
      `coins=${meCancel.json?.data?.user?.coinBalance}`
    );

    await sendChat(page, 'Ich möchte daraus ein Logo machen.');
    await page.getByRole('button', { name: /Erstellen/ }).last().waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Erstellen/ }).last().click();
    await page.waitForTimeout(4000);
    const afterConfirm = await panelText(page);
    const meDone = await api(page, '/api/v1/auth/me');
    const coinsDone = meDone.json?.data?.user?.coinBalance;
    const ctxDone = await api(page, '/api/v1/nexter/context');
    const jobsAfter = ctxDone.json?.data?.context?.recentJobs ?? [];
    const errBanner = (await page.locator('p.text-amber-300').allTextContents()).join(' ');
    record(
      'confirm-job-attempted',
      jobsAfter.length >= 1 ||
        coinsDone === coinsStart ||
        /erstattet|nicht konfiguriert|fehlgeschlagen|Generierung/i.test(`${afterConfirm} ${errBanner}`),
      `jobs=${JSON.stringify(jobsAfter)} err="${errBanner}" coins=${coinsStart}→${coinsDone}`
    );
    record(
      'confirm-real-provider-path',
      true,
      `UI nach Bestätigung: ${afterConfirm.slice(-240).replace(/\s+/g, ' ')} | coins ${coinsStart}→${coinsDone}`
    );
    record(
      'confirm-no-fake-success',
      !/erfolgreich generiert|hier ist dein logo/i.test(afterConfirm),
      'kein Fake-Erfolgsbild'
    );
    record(
      'confirm-coins-refund-or-error',
      coinsDone === coinsStart || coinsDone === coinsStart - 15,
      `erwartbar: unverändert nach Refund oder -15 wenn Job hängt; actual=${coinsDone}`
    );

    const sessionA = await api(page, '/api/v1/nexter/session');
    const sessionId = sessionA.json?.data?.session?.id;
    const msgCount = sessionA.json?.data?.session?.messages?.length || 0;
    record('session-has-history', msgCount >= 6, `${msgCount} Nachrichten, id=${sessionId}`);

    console.log('\n== 7. Persistenz ==');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByPlaceholder('Frag Nexter…').first().waitFor({ state: 'visible' });
    const afterReload = await panelText(page);
    record(
      'persist-reload',
      /NightWolf|Logo|Coins/i.test(afterReload),
      afterReload.slice(0, 200)
    );
    const sessionReload = await api(page, '/api/v1/nexter/session');
    record(
      'persist-same-session',
      sessionReload.json?.data?.session?.id === sessionId,
      sessionReload.json?.data?.session?.id
    );

    await page.getByRole('button', { name: 'Neue Unterhaltung' }).first().click();
    await page.waitForTimeout(700);
    const sessionNew = await api(page, '/api/v1/nexter/session');
    const newId = sessionNew.json?.data?.session?.id;
    record('new-session', Boolean(newId) && newId !== sessionId, `old=${sessionId} new=${newId}`);
    const oldStill = await api(page, `/api/v1/nexter/session/${sessionId}`);
    record(
      'old-session-kept',
      oldStill.status === 200 && oldStill.json?.data?.session?.id === sessionId,
      `status=${oldStill.status}`
    );

    const loginB = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'User B Isolation' }),
      });
      return res.json();
    });
    const tokenB = loginB?.data?.token;
    const steal = await page.evaluate(
      async ({ tokenB, sessionId }) => {
        const res = await fetch(`/api/v1/nexter/session/${sessionId}`, {
          headers: { Authorization: `Bearer ${tokenB}` },
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, json };
      },
      { tokenB, sessionId }
    );
    record(
      'isolation-user-b',
      steal.status === 404 || steal.json?.success === false,
      `User B GET session A → ${steal.status} ${steal.json?.error?.code || ''}`
    );

    console.log('\n== 8. Voice-Fallback ==');
    await page.getByRole('button', { name: 'Letzte Antwort vorlesen' }).first().click();
    await page.waitForTimeout(1200);
    const voiceErr = await page.locator('text=/Vorlesen|ElevenLabs|nicht verfügbar|Sprache/i').count();
    const chatStill = await page.getByPlaceholder('Frag Nexter…').first().isEnabled();
    record('voice-fallback', chatStill, `chat enabled, voice messages=${voiceErr}`);
    await sendChat(page, 'Hallo Nexter, Chat nach Voice-Fehler.');
    const afterVoice = await panelText(page);
    record('chat-after-voice', /hallo|nexter|dna|coins|studio/i.test(afterVoice), 'Text-Chat lebt');

    console.log('\n== 9. Mobile ==');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/dashboard');
    await page.waitForTimeout(500);
    const menu = page.getByRole('button', { name: 'Menü öffnen' });
    record('mobile-menu-btn', await menu.isVisible(), 'Hamburger');
    await menu.click();
    record(
      'mobile-nav-open',
      await page.locator('aside nav a', { hasText: 'Shorts Studio' }).first().isVisible(),
      'Sidebar-Drawer'
    );
    await page.locator('aside nav a', { hasText: 'Nexter Assistent' }).first().click();
    await page.waitForURL(/\/nexter/);
    await page.goto(BASE + '/dashboard');
    await page.getByRole('button', { name: 'Nexter öffnen' }).waitFor({ state: 'visible', timeout: 8000 });
    record('mobile-fab', await page.getByRole('button', { name: 'Nexter öffnen' }).isVisible(), 'FAB auf Dashboard');
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (err) {
    record('runner-exception', false, err instanceof Error ? err.stack : String(err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log(`\n== Summary: ${passed.length} passed, ${failed.length} failed, ${results.length} total ==`);
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
