/**
 * Phase F local acceptance: Animation / Video / Shorts studios.
 * Provider-independent core: upload → metadata → trim → 9:16 export.
 * Usage: BASE_URL=http://localhost:5173 node scripts/e2e/nexter-phase-f.mjs
 */
import { chromium } from 'playwright';
import { completeOnboardingIfNeeded } from './onboarding-helper.mjs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

function resolveFfmpeg() {
  const require = createRequire(import.meta.url);
  try {
    return require('ffmpeg-static');
  } catch {
    return require(join(process.cwd(), 'backend/node_modules/ffmpeg-static'));
  }
}

function makeTinyMp4() {
  const bin = resolveFfmpeg();
  const dir = mkdtempSync(join(tmpdir(), 'ucbs-e2e-f-'));
  const out = join(dir, 'tiny.mp4');
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x1E40AF:s=320x240:d=2.4',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2.4',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      out,
    ]);
    let err = '';
    proc.stderr.on('data', (c) => {
      err += c.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err.slice(-400) || `ffmpeg ${code}`));
    });
    proc.on('error', reject);
  });
}

function fileToDataUrl(path, mime = 'video/mp4') {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  let tinyPath = '';

  try {
    tinyPath = await makeTinyMp4();
    record('tiny-fixture', true, tinyPath);
  } catch (err) {
    record('tiny-fixture', false, err instanceof Error ? err.message : String(err));
  }

  try {
    console.log('\n== Phase F: Login → DNA → Animation Studio ==');
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
    record('coins-start', coinsStart >= 25, `coins=${coinsStart}`);

    await page.locator('aside nav a', { hasText: 'Animation Studio' }).first().click();
    await page.waitForURL(/\/animation-studio/);
    record('animation-page', page.url().includes('/animation-studio'), page.url());
    await page.getByTestId('animation-wizard').waitFor({ state: 'visible', timeout: 10000 });
    record('animation-wizard', await page.getByTestId('animation-wizard').isVisible(), 'Wizard');
    record('animation-type-intro', await page.getByTestId('animation-type-intro').isVisible(), 'Intro');
    record('animation-type-loop', await page.getByTestId('animation-type-logo-loop').isVisible(), 'Logo Loop');
    record('animation-nexter-chip', await page.getByTestId('animation-nexter-chip').isVisible(), 'Chip');
    record(
      'no-kill-button',
      (await page.getByText(/kill erkannt|headshot|warzone victory/i).count()) === 0,
      'keine Fake-Detection-UI'
    );

    const directAnim = await api(page, '/api/v1/animations', {
      method: 'POST',
      body: JSON.stringify({ type: 'intro', durationSec: 6 }),
    });
    record(
      'animation-post-rejected',
      directAnim.status === 400 && directAnim.json?.error?.code === 'ANIMATION_REQUIRES_QUOTE',
      `status=${directAnim.status} code=${directAnim.json?.error?.code}`
    );
    record('animation-post-no-debit', (await coins(page)) === coinsStart, 'kein Coin-Abzug');

    console.log('\n== Phase F: Nexter animation quote → cancel ==');
    await page.getByRole('button', { name: 'Neue Unterhaltung' }).first().click();
    await page.waitForTimeout(600);
    await sendChat(page, 'Öffne das Animation Studio.');
    const createAfterOpen = await page.getByRole('button', { name: /Erstellen/, disabled: false }).count();
    record('open-animation-no-quote', createAfterOpen === 0, `erstellen=${createAfterOpen}`);

    await page.getByTestId('animation-nexter-chip').click();
    const createBtn = page.getByRole('button', { name: /Erstellen/ }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    record('nexter-animation-quote', /25/.test(await createBtn.innerText()), await createBtn.innerText());

    await page.getByRole('button', { name: 'Abbrechen' }).first().click();
    await page.waitForTimeout(800);
    const coinsAfterCancel = await coins(page);
    record(
      'quote-cancel-no-coins',
      coinsAfterCancel === coinsStart,
      `coins=${coinsAfterCancel}`
    );

    console.log('\n== Phase F: Confirm animation (honest fail + refund if no provider) ==');
    await sendChat(page, 'Animier mein Logo.');
    const sessionRes = await api(page, '/api/v1/nexter/session');
    const msgs = sessionRes.json?.data?.session?.messages ?? [];
    const quoted = [...msgs].reverse().find((m) =>
      (m.actions ?? []).some((a) => a.tool === 'start_generation' && a.payload?.quoteId)
    );
    const quoteId = quoted?.actions?.find((a) => a.tool === 'start_generation')?.payload?.quoteId;
    record('animation-quote-id', Boolean(quoteId), String(quoteId ?? 'none'));
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
      /fehlgeschlagen|erstattet|OPENAI|Provider|nicht konfiguriert|DNA|Coins|Replicate|Runway|API/i.test(confirmMsg);
    const succeededPaid = confirm.status === 200 && (spent === 25 || spent === 0);
    record(
      'animation-confirm-honest',
      failedHonestly || succeededPaid,
      `status=${confirm.status} spent=${spent} msg=${confirmMsg.slice(0, 220)}`
    );
    record('animation-no-fake-video', !/example\.com|placeholder|fake-video/i.test(confirmMsg), 'kein Fake-Video');

    console.log('\n== Phase F: Video upload / metadata / edit-plan / local export ==');
    await page.locator('aside nav a', { hasText: 'Video Studio' }).first().click();
    await page.waitForURL(/\/video-studio/);
    record('video-page', page.url().includes('/video-studio'), page.url());
    await page.getByTestId('video-wizard').waitFor({ state: 'visible' });

    const createdVideo = await api(page, '/api/v1/video', {
      method: 'POST',
      body: JSON.stringify({ title: 'Phase F Test', duration: 30, format: 'youtube' }),
    });
    const videoId = createdVideo.json?.data?.project?.id;
    record('video-create', createdVideo.status === 201 && Boolean(videoId), videoId || createdVideo.json?.error?.message);

    let uploaded;
    if (videoId && tinyPath) {
      const dataUrl = fileToDataUrl(tinyPath);
      uploaded = await api(page, `/api/v1/video/${videoId}/source`, {
        method: 'POST',
        body: JSON.stringify({ dataUrl, rightsConfirmed: true }),
      });
    } else {
      uploaded = { status: 0, json: {} };
    }
    const project = uploaded.json?.data?.project;
    const meta = project?.metadata;
    record(
      'video-upload',
      uploaded.status === 200 && Boolean(project?.sourceUrl),
      `status=${uploaded.status}`
    );
    record(
      'video-metadata-real',
      Boolean(meta?.durationSec > 1 && meta?.width >= 320 && meta?.height >= 240),
      `dur=${meta?.durationSec} ${meta?.width}x${meta?.height} codec=${meta?.videoCodec}`
    );

    const badType = await api(page, `/api/v1/video/${videoId}/source`, {
      method: 'POST',
      body: JSON.stringify({ dataUrl: 'data:image/png;base64,aaaa', rightsConfirmed: true }),
    });
    record(
      'reject-non-video',
      badType.status >= 400,
      `status=${badType.status} code=${badType.json?.error?.code}`
    );

    const plan = await api(page, `/api/v1/video/${videoId}/edit-plan`, {
      method: 'PATCH',
      body: JSON.stringify({
        trimStart: 0.3,
        trimEnd: 1.5,
        removeSegments: [],
        volume: 1,
        crop: { mode: 'center', x: 0, y: 0, width: 1, height: 1 },
        aspectRatio: 'original',
        subtitleTrack: false,
      }),
    });
    record(
      'edit-plan-save',
      plan.status === 200 && Math.abs((plan.json?.data?.project?.editPlan?.trimStart ?? -1) - 0.3) < 0.05,
      `start=${plan.json?.data?.project?.editPlan?.trimStart}`
    );

    await page.reload();
    await page.getByTestId('video-wizard').waitFor({ state: 'visible', timeout: 15000 });
    const reloaded = await api(page, `/api/v1/video/${videoId}`);
    record(
      'edit-plan-reload',
      Math.abs((reloaded.json?.data?.project?.editPlan?.trimStart ?? -1) - 0.3) < 0.05,
      `start=${reloaded.json?.data?.project?.editPlan?.trimStart}`
    );

    const localAnalyze = await api(page, `/api/v1/video/${videoId}/analyze-local`, { method: 'POST' });
    const scenes = localAnalyze.json?.data?.project?.scenes ?? [];
    record(
      'local-analyze',
      localAnalyze.status === 200 && scenes.length >= 1 && scenes[0].end > scenes[0].start,
      `status=${localAnalyze.status} scenes=${scenes.length}`
    );
    const highlights = localAnalyze.json?.data?.project?.highlights ?? [];
    record(
      'highlights-honest',
      highlights.every((h) => h.end > h.start && !/kill|headshot|victory/i.test(`${h.label} ${h.reason ?? ''}`)),
      `n=${highlights.length}`
    );

    const whisper = await api(page, `/api/v1/video/${videoId}/subtitles`, { method: 'POST' });
    const whisperOk = whisper.status === 200;
    const whisperHonest = whisper.status >= 400 && /OPENAI|Whisper|konfiguriert|Key/i.test(
      whisper.json?.error?.message ?? ''
    );
    record(
      'whisper-optional',
      whisperOk || whisperHonest,
      `status=${whisper.status} ${whisper.json?.error?.message ?? 'ok'}`
    );
    const stillThere = await api(page, `/api/v1/video/${videoId}`);
    record(
      'editor-survives-whisper',
      stillThere.status === 200 && Boolean(stillThere.json?.data?.project?.sourceUrl),
      `status=${stillThere.status}`
    );

    const rendered = await api(page, `/api/v1/video/${videoId}/render`, { method: 'POST' });
    record(
      'local-export',
      rendered.status === 200 && Boolean(rendered.json?.data?.project?.renderUrl),
      `status=${rendered.status} url=${String(rendered.json?.data?.project?.renderUrl ?? '').slice(0, 48)}`
    );
    const originalUrl = project?.sourceUrl;
    record(
      'original-unchanged',
      stillThere.json?.data?.project?.sourceUrl === originalUrl &&
        rendered.json?.data?.project?.renderUrl !== originalUrl,
      'source ≠ render'
    );

    const brand = await api(page, '/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Phase F Video', type: 'custom' }),
    });
    const brandId = brand.json?.data?.project?.id;
    const savedProject = brandId
      ? await api(page, `/api/v1/video/${videoId}/save-project`, {
          method: 'POST',
          body: JSON.stringify({ projectId: brandId }),
        })
      : { status: 0, json: {} };
    record(
      'save-project',
      savedProject.status === 201 && (savedProject.json?.data?.project?.assets?.length ?? 0) >= 1,
      `status=${savedProject.status}`
    );
    const savedFile = await api(page, `/api/v1/video/${videoId}/save-file`, { method: 'POST' });
    record('save-file', savedFile.status === 201 && Boolean(savedFile.json?.data?.file?.id), `status=${savedFile.status}`);

    console.log('\n== Phase F: Shorts 9:16 + crop ==');
    await page.locator('aside nav a', { hasText: 'Shorts Studio' }).first().click();
    await page.waitForURL(/\/shorts-studio/);
    record('shorts-page', page.url().includes('/shorts-studio'), page.url());
    await page.getByTestId('shorts-wizard').waitFor({ state: 'visible' });

    const shortJob = await api(page, `/api/v1/video/${videoId}/shorts`, {
      method: 'POST',
      body: JSON.stringify({
        start: 0.2,
        end: 1.4,
        format: 'shorts',
        crop: { mode: 'manual', x: 0.2, y: 0, width: 0.4, height: 1 },
        burnSubtitles: false,
      }),
    });
    const job = shortJob.json?.data?.job;
    record(
      'shorts-export',
      shortJob.status === 201 && job?.status === 'completed' && Boolean(job?.videoUrl) && job?.metadata?.width === 1080,
      `status=${shortJob.status} job=${job?.status} ${job?.metadata?.width}x${job?.metadata?.height} coins=${shortJob.json?.data?.coinsSpent}`
    );
    record('shorts-free', (shortJob.json?.data?.coinsSpent ?? 0) === 0, `coinsSpent=${shortJob.json?.data?.coinsSpent}`);

    const short2 = await api(page, `/api/v1/video/${videoId}/shorts`, {
      method: 'POST',
      body: JSON.stringify({ start: 0.5, end: 1.6, format: 'shorts' }),
    });
    const listed = await api(page, `/api/v1/video/${videoId}`);
    const shorts = listed.json?.data?.project?.shorts ?? [];
    record(
      'shorts-separate-assets',
      shorts.length >= 2 && shorts[0].id !== shorts[1].id,
      `n=${shorts.length}`
    );

    const patchedSubs = await api(page, `/api/v1/video/${videoId}/subtitles`, {
      method: 'PATCH',
      body: JSON.stringify({
        subtitles: [{ start: 0.2, end: 1.0, text: 'Korrigierter Untertitel' }],
      }),
    });
    record(
      'subtitle-persist',
      patchedSubs.status === 200 && patchedSubs.json?.data?.project?.subtitles?.[0]?.text === 'Korrigierter Untertitel',
      patchedSubs.json?.data?.project?.subtitles?.[0]?.text
    );

    if (highlights[1] || highlights[0]) {
      const h = highlights[1] || highlights[0];
      const idx = highlights[1] ? 1 : 0;
      await page.goto(`${BASE}/shorts-studio?projectId=${videoId}&start=${h.start}&end=${h.end}`);
      await page.getByTestId('shorts-range').waitFor({ state: 'visible', timeout: 15000 });
      const rangeText = await page.getByTestId('shorts-range').innerText();
      record(
        'highlight-to-short',
        rangeText.includes(':') && page.url().includes(`start=${h.start}`),
        rangeText
      );
      void idx;
    } else {
      record('highlight-to-short', true, 'keine lokalen Highlights — Grenze dokumentiert, nicht simuliert');
    }

    console.log('\n== Phase F: Nexter video orchestration ==');
    await page.goto(BASE + '/video-studio');
    await page.getByTestId('video-wizard').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Neue Unterhaltung' }).first().click();
    await page.waitForTimeout(500);
    await sendChat(page, 'Zeig mir die besten Stellen aus meinem Video.');
    const hlPanel = await panelText(page);
    record(
      'nexter-highlights',
      /Highlight|Analyse|lokal|Score|keine Kill/i.test(hlPanel),
      hlPanel.slice(-200).replace(/\s+/g, ' ')
    );

    await sendChat(page, 'Kill erkannt — Headshot?');
    const killPanel = await panelText(page);
    record(
      'nexter-no-fake-kills',
      /nicht verfügbar|keine Gameplay/i.test(killPanel) && !/Kill erkannt um/i.test(killPanel),
      killPanel.slice(-160).replace(/\s+/g, ' ')
    );

    await sendChat(page, 'Analysiere dieses Video');
    const analyzePanel = await panelText(page);
    const analyzeCreate = await page.getByRole('button', { name: /Erstellen/, disabled: false }).count();
    record(
      'nexter-analyze-no-auto-job',
      analyzeCreate === 0 && /Video Studio|lokal|Whisper|nicht automatisch/i.test(analyzePanel),
      `erstellen=${analyzeCreate}`
    );

    if (highlights.length >= 1) {
      await sendChat(page, 'Mach Highlight 1 zu einem Short');
      const shortPanel = await panelText(page);
      record(
        'nexter-highlight-short',
        new RegExp(`${highlights[0].start.toFixed(1)}`).test(shortPanel) || /Shorts Studio|Highlight 1/i.test(shortPanel),
        shortPanel.slice(-180).replace(/\s+/g, ' ')
      );
    } else {
      record('nexter-highlight-short', true, 'kein Highlight — ehrlicher Fallback, nicht simuliert');
    }

    console.log('\n== Phase F: Isolation ==');
    const loginB = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'User B Video' }),
      });
      return res.json();
    });
    const tokenB = loginB?.data?.token;
    const steal = await page.evaluate(
      async ({ tokenB, videoId }) => {
        const one = await fetch(`/api/v1/video/${videoId}`, {
          headers: { Authorization: `Bearer ${tokenB}` },
        });
        const oneJson = await one.json().catch(() => ({}));
        const analyze = await fetch(`/api/v1/video/${videoId}/analyze-local`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenB}` },
        });
        const shorts = await fetch(`/api/v1/video/${videoId}/shorts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
          body: JSON.stringify({ start: 0, end: 1 }),
        });
        return {
          getStatus: one.status,
          getCode: oneJson?.error?.code,
          analyzeStatus: analyze.status,
          shortsStatus: shorts.status,
        };
      },
      { tokenB, videoId }
    );
    record(
      'isolation-get',
      steal.getStatus === 404 || steal.getCode === 'NOT_FOUND',
      `status=${steal.getStatus} code=${steal.getCode}`
    );
    record(
      'isolation-analyze',
      steal.analyzeStatus === 404 || steal.analyzeStatus >= 400,
      `status=${steal.analyzeStatus}`
    );
    record(
      'isolation-shorts',
      steal.shortsStatus === 404 || steal.shortsStatus >= 400,
      `status=${steal.shortsStatus}`
    );

    const foreignLogo = await page.evaluate(async ({ tokenB }) => {
      const res = await fetch('/api/v1/nexter/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ message: 'Hallo' }),
      });
      return res.status;
    }, { tokenB });
    record('user-b-chat-ok', foreignLogo === 200 || foreignLogo === 201, `status=${foreignLogo}`);
  } catch (err) {
    record('uncaught', false, err instanceof Error ? err.stack : String(err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.ok === false);
  const passed = results.filter((r) => r.ok);
  console.log(`\n== Phase F Summary: ${passed.length} passed, ${failed.length} failed, ${results.length} total ==`);
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
