import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  OVERLAY_ASPECT_PRESETS,
  OVERLAY_PLATFORM_SPECS,
  applyOverlayChangeRequest,
  applyOverlayPlatformPreset,
  overlayConfigFromDna,
  overlayConfigToGenerationOptions,
  overlayConfigFromGenerationOptions,
  overlayDownloadFilename,
  overlayNeedsFollowUp,
  buildOverlayDesignSummary,
  defaultOverlayConfig,
  detectDnaChangeScope,
  parseOverlayIntent,
  sanitizeOverlayStyleRequest,
  validateOverlayDimensions,
  validateOverlayFormat,
  validateOverlayRegion,
  validateOverlayRegions,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, upsertDna } from './dna.service.js';
import { createProject, getProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { getUserFile, saveUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { dsSet } from '../lib/data-store.js';
import {
  assertOwnedOverlayReference,
  downloadOverlay,
  generateOverlayAsset,
  getOverlay,
  listOverlay,
  listOverlayVersions,
  requireOwnedOverlayJob,
  retryOverlayJob,
  setOverlayTestHooks,
} from './overlay.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { previewStreamsetDraft, requireOwnedLogoJob } from './streamset.service.js';
import { setLogoTestHooks } from './logo.service.js';
import { requireOwnedFacecamJob, setFacecamTestHooks } from './facecam.service.js';
import { createLayout } from './layout.service.js';
import { buildOverlayPrompt } from './studio-prompt.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setOverlayTestHooks(null);
  setLogoTestHooks(null);
  setFacecamTestHooks(null);
});

after(() => {
  setOverlayTestHooks(null);
  setLogoTestHooks(null);
  setFacecamTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-close.test`, 'Mark');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    secondaryColors: ['#7C3AED'],
    brandingStyle: 'esports',
    targetPlatforms: ['twitch'],
  });
  const project = await createProject(user.id, { name: 'Overlay Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('overlay closure — project, dna, config', () => {
  it('persists owned overlay project and does not rewrite DNA', async () => {
    const { user, project, dna } = await seed();
    const before = dna.version;
    setOverlayTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'overlay', project.id, {
      platform: 'twitch',
      width: 1920,
      height: 1080,
      format: 'png',
      transparentBackground: true,
      layoutPreset: 'gameplay-facecam-chat',
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getOverlay(result.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.projectId, project.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.fileId);
    assert.equal(job?.width, 1920);
    assert.equal(job?.height, 1080);
    assert.equal(job?.transparentBackground, true);
    const listed = await listOverlay(user.id);
    assert.ok(listed.some((j) => j.id === job?.id));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-b.test`, 'B');
    assert.equal(await getOverlay(job!.id, other.id), null);
  });

  it('uses Creator DNA as defaults and works without DNA when a platform is given', async () => {
    const defaults = overlayConfigFromDna({
      name: 'NightWolf',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#7C3AED'],
      accentColors: [],
      styleDirection: 'esports',
      mascot: 'Wolf',
      brandingStyle: 'esports',
      platformOptimization: [{ platform: 'twitch', aspectRatios: ['16:9'], optimizations: [] }],
    });
    assert.equal(defaults.platform, 'twitch');
    assert.ok(defaults.colors?.includes('#1E40AF'));
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-nodna.test`, 'Solo');
    setOverlayTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'overlay', undefined, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getOverlay(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(await getActiveDna(user.id), null);
  });

  it('validates dimensions, format, transparency, regions, and prompt builder', () => {
    assert.equal(validateOverlayDimensions(0, 1080).ok, false);
    assert.equal(validateOverlayDimensions(-1, 1080).ok, false);
    assert.equal(validateOverlayDimensions(1920, 1080).ok, true);
    assert.equal(validateOverlayFormat('jpg', true).ok, false);
    assert.equal(validateOverlayFormat('png', true).ok, true);
    assert.equal(validateOverlayFormat('webp', true).ok, true);
    assert.equal('17:9' in OVERLAY_ASPECT_PRESETS, false);
    const twitch = parseOverlayIntent('Mach mir ein Twitch Overlay.');
    assert.equal(twitch.config.platform, 'twitch');
    assert.equal(twitch.config.width, OVERLAY_ASPECT_PRESETS['16:9'].width);
    assert.equal(twitch.config.layoutPreset, 'gameplay-facecam-chat');
    assert.match(twitch.config.summary, /Twitch/i);
    const tiktok = parseOverlayIntent('Ich brauche ein TikTok Gaming Layout.');
    assert.equal(tiktok.config.platform, 'tiktok');
    assert.equal(tiktok.config.layoutPreset, 'tiktok-vertical');
    assert.equal(tiktok.config.width, OVERLAY_ASPECT_PRESETS['9:16'].width);
    const stacked = parseOverlayIntent('Oben Facecam, Mitte Gameplay, unten Chat.');
    assert.equal(stacked.config.layoutPreset, 'tiktok-vertical');
    assert.equal(stacked.config.facecamRegion.visible, true);
    assert.equal(stacked.config.gameplayRegion.visible, true);
    assert.equal(stacked.config.chatRegion.visible, true);
    const custom = defaultOverlayConfig({ platform: 'custom', width: 1280, height: 720, aspectRatio: 'custom' });
    assert.equal(custom.width, 1280);
    assert.equal(custom.height, 720);
    assert.equal(
      validateOverlayRegion({ visible: true, x: -1, y: 0, width: 100, height: 100, transparent: true }, 1920, 1080, 'Gameplay')
        .ok,
      false
    );
    assert.equal(
      validateOverlayRegion({ visible: true, x: 0, y: 0, width: 0, height: 100, transparent: true }, 1920, 1080, 'Gameplay')
        .ok,
      false
    );
    assert.equal(
      validateOverlayRegion(
        { visible: true, x: 1800, y: 0, width: 200, height: 100, transparent: true },
        1920,
        1080,
        'Gameplay'
      ).ok,
      false
    );
    const valid = defaultOverlayConfig({ platform: 'twitch' });
    assert.equal(validateOverlayRegions(valid).ok, true);
    assert.equal(valid.gameplayRegion.transparent, true);
    assert.equal(valid.facecamRegion.transparent, true);
    const safe = sanitizeOverlayStyleRequest('Kopiere exakt den Overlay von BrandX');
    assert.equal(/BrandX/i.test(safe) && /exakt den Overlay von BrandX/i.test(safe), false);
    assert.match(buildOverlayDesignSummary(valid), /transparent/i);
    assert.equal(OVERLAY_PLATFORM_SPECS.tiktok.defaultAspect, '9:16');
    assert.equal(applyOverlayPlatformPreset(defaultOverlayConfig({ platform: 'twitch' }), 'tiktok').aspectRatio, '9:16');
    const cfg = defaultOverlayConfig({ platform: 'twitch', layoutPreset: 'gameplay-facecam-chat' });
    const opts = overlayConfigToGenerationOptions(cfg);
    const roundtrip = overlayConfigFromGenerationOptions(opts);
    assert.equal(roundtrip.layoutPreset, cfg.layoutPreset);
    assert.equal(roundtrip.gameplayRegion.x, cfg.gameplayRegion.x);
    assert.equal(roundtrip.gameplayRegion.width, cfg.gameplayRegion.width);
  });
});

describe('overlay closure — nexter', () => {
  it('parses intents and asks follow-up instead of quoting vague overlay without platform', async () => {
    assert.equal(detectQuoteKind('Mach mir ein Overlay.'), 'overlay');
    assert.equal(detectQuoteKind('Mach mir ein Twitch Overlay.'), 'overlay');
    assert.equal(detectQuoteKind('Ich brauche ein TikTok Gaming Layout.'), 'overlay');
    assert.equal(detectQuoteKind('Oben Facecam, Mitte Gameplay, unten Chat.'), 'overlay');
    assert.equal(overlayNeedsFollowUp('Mach mir ein Overlay.'), true);
    assert.equal(overlayNeedsFollowUp('Mach mir ein Twitch Overlay.'), false);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-fu.test`, 'Ask');
    const session = await nexterChat(user.id, 'Mach mir ein Overlay.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Twitch|TikTok|Plattform|Overlay Studio/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('concrete Nexter overlay request prepares a quote without starting a job or writing DNA', async () => {
    const { user, dna } = await seed();
    const before = dna.version;
    const session = await nexterChat(
      user.id,
      'Mach mir ein Twitch Overlay, Facecam unten links, Chat rechts, Logo oben links, blau und violett.'
    );
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), true);
    assert.equal((await listOverlay(user.id)).length, 0);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
  });

  it('does not silently change DNA; explicit DNA phrases ask for confirmation', async () => {
    assert.equal(detectDnaChangeScope('Ab jetzt soll mein gesamtes Design blau/violett sein.'), 'explicit-dna');
    const { user, dna } = await seed();
    const session = await nexterChat(user.id, 'Ab jetzt soll mein gesamtes Design blau/violett sein.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /DNA|nicht automatisch|Projekt/i);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('overlay closure — quote, mock, refund, result', () => {
  it('requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/studio.routes.ts');
    assert.match(routes, /OVERLAY_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listOverlay(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.OVERLAY_GENERATION]);
  });

  it('mock success persists owned result; failure refunds once; retry needs quote', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setOverlayTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'overlay', project.id, {
      platform: 'twitch',
      format: 'png',
      transparentBackground: true,
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getOverlay(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    const fileId = String(job!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadOverlay(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadOverlay(job!.id, user.id);
    assert.ok(again.downloadUrl);
    assert.match(dl.filename, /nightwolf|twitch-overlay-v/i);
    assert.equal(
      overlayDownloadFilename({ creatorName: 'Night Wolf!', platform: 'tiktok', version: 1, ext: 'png' }),
      'night-wolf-tiktok-overlay-v1.png'
    );
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-d.test`, 'D');
    await assert.rejects(() => downloadOverlay(job!.id, other.id));
    await assert.rejects(
      () => retryOverlayJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setOverlayTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listOverlay(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    await assert.rejects(
      () => retryOverlayJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'OVERLAY_REQUIRES_QUOTE'
    );
  });

  it('rejects JPG transparency and accepts PNG/WebP', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'success' });
    await assert.rejects(
      () =>
        generateOverlayAsset(user.id, project.id, {
          platform: 'twitch',
          format: 'jpg',
          transparentBackground: true,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'OVERLAY_FORMAT_INVALID'
    );
    const quote = await createQuote(user.id, 'overlay', project.id, {
      platform: 'twitch',
      format: 'webp',
      transparentBackground: true,
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getOverlay(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.mimeType, 'image/webp');
  });

  it('rejects invalid regions and keeps prompt/job parity', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'success' });
    await assert.rejects(
      () =>
        generateOverlayAsset(user.id, project.id, {
          platform: 'twitch',
          gameplayRegion: { visible: true, x: -8, y: 0, width: 400, height: 300, transparent: true },
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'OVERLAY_REGION_INVALID'
    );
    const cfg = defaultOverlayConfig({ platform: 'twitch' });
    const prompt = buildOverlayPrompt(
      {
        id: 'dna',
        userId: user.id,
        name: 'NightWolf',
        type: 'creator',
        primaryColors: ['#1E40AF'],
        secondaryColors: ['#7C3AED'],
        accentColors: [],
        styleDirection: 'neon',
        favoriteGenres: [],
        gamingStyle: '',
        brandingStyle: 'esports',
        promptStyle: '',
        visualLanguage: '',
        animations: [],
        personalGuidelines: '',
        fonts: [],
        brandingRules: [],
        platformOptimization: [],
        targetAudience: { ageRange: '', interests: [], platforms: [], tone: '', description: '' },
        designLanguage: { mood: [], keywords: [], visualElements: [], doNotUse: [] },
        sourceAssets: [],
        version: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      overlayConfigToGenerationOptions(cfg)
    );
    assert.match(prompt, /gameplay/i);
    assert.match(prompt, /TRANSPARENT/i);
    assert.match(prompt, /1920/);
  });

  it('change/variant reuses config, versions, and does not mutate DNA', async () => {
    const { user, project, dna } = await seed();
    setOverlayTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'overlay', project.id, {
      platform: 'twitch',
      layoutPreset: 'gameplay-facecam-chat',
      borderStyle: 'medium',
    });
    const first = await confirmQuote(user.id, quote.id);
    const changed = applyOverlayChangeRequest(
      defaultOverlayConfig({ platform: 'twitch', borderStyle: 'medium' }),
      'Facecam kleiner. Gameplay größer. Chat höher. Rahmen dünner. Mehr Blau.'
    );
    assert.equal(changed.borderStyle, 'thin');
    assert.ok(changed.facecamRegion.width <= defaultOverlayConfig({ platform: 'twitch' }).facecamRegion.width);
    const change = await createQuote(user.id, 'overlay', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Ändere mein Overlay: Facecam kleiner. Rahmen dünner.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getOverlay(second.jobIds[0]!, user.id);
    assert.ok(variant);
    const versions = await listOverlayVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);
    const listed = await listOverlay(user.id);
    assert.ok(listed.some((j) => j.id === first.jobIds[0]));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('overlay closure — logo, facecam, streamset, conversion, layout, project', () => {
  it('accepts owned logo/facecam and rejects foreign assets and external URLs', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    setFacecamTestHooks({ result: 'success' });
    setOverlayTestHooks({ result: 'success' });
    const logoQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const logoRes = await confirmQuote(user.id, logoQuote.id);
    const logo = await requireOwnedLogoJob(user.id, logoRes.jobIds[0]!);
    const facecamQuote = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    const facecamRes = await confirmQuote(user.id, facecamQuote.id);
    const facecam = await requireOwnedFacecamJob(user.id, facecamRes.jobIds[0]!);
    const overlayQuote = await createQuote(user.id, 'overlay', project.id, {
      platform: 'twitch',
      sourceLogoJobId: logo.id,
      sourceFacecamJobId: facecam.id,
    });
    const overlayRes = await confirmQuote(user.id, overlayQuote.id);
    const overlay = await getOverlay(overlayRes.jobIds[0]!, user.id);
    assert.equal(overlay?.status, 'completed');

    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-logo.test`, 'X');
    await assert.rejects(
      () => generateOverlayAsset(other.id, undefined, { platform: 'twitch', sourceLogoJobId: logo.id }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'LOGO_NOT_FOUND' || err.code === 'FOREIGN_REFERENCE')
    );
    await assert.rejects(
      () => generateOverlayAsset(other.id, undefined, { platform: 'twitch', sourceFacecamJobId: facecam.id }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'FACECAM_NOT_FOUND' || err.code === 'FOREIGN_REFERENCE')
    );
    await assert.rejects(
      () => generateOverlayAsset(user.id, undefined, { platform: 'twitch', referenceUrl: 'https://evil.example/f.png' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NO_EXTERNAL_URL'
    );
  });

  it('overlay without logo and without facecam still completes', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'overlay', project.id, { platform: 'general' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getOverlay(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.config?.logoJobId, undefined);
    assert.equal(job?.config?.facecamJobId, undefined);
  });

  it('accepts owned reference images and rejects foreign and SVG files', async () => {
    const { user } = await seed();
    const PIXEL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const owned = await saveUserFile(user.id, {
      name: 'ref.png',
      mimeType: 'image/png',
      category: 'overlay',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assertOwnedOverlayReference(user.id, owned.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-ref.test`, 'X');
    const foreign = await saveUserFile(other.id, {
      name: 'steal.png',
      mimeType: 'image/png',
      category: 'overlay',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assert.rejects(
      () => assertOwnedOverlayReference(user.id, foreign.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_REFERENCE'
    );
    const svgId = randomUUID();
    await dsSet('files', svgId, {
      id: svgId,
      userId: user.id,
      name: 'x.svg',
      mimeType: 'image/svg+xml',
      size: 12,
      category: 'overlay',
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => assertOwnedOverlayReference(user.id, svgId),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_REFERENCE_MIME'
    );
  });

  it('own overlay attaches as project asset and can seed streamset draft; foreign overlay is rejected', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const overlay = await requireOwnedOverlayJob(user.id, result.jobIds[0]!);
    const projectRow = await getProject(project.id, user.id);
    assert.ok(projectRow?.assets.some((a) => a.jobId === overlay.id || a.module === 'overlay'));
    const draft = await previewStreamsetDraft(user.id, { projectId: project.id, selectedKeys: ['hud'] });
    assert.ok(draft.selectedKeys.includes('hud'));
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-ss.test`, 'Z');
    await assert.rejects(() => requireOwnedOverlayJob(other.id, overlay.id));
  });

  it('Twitch to TikTok conversion uses new dimensions and owned parent only', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' });
    const first = await confirmQuote(user.id, quote.id);
    const converted = applyOverlayPlatformPreset(defaultOverlayConfig({ platform: 'twitch' }), 'tiktok');
    assert.equal(converted.width, OVERLAY_ASPECT_PRESETS['9:16'].width);
    assert.equal(converted.height, OVERLAY_ASPECT_PRESETS['9:16'].height);
    assert.equal(converted.layoutPreset, 'tiktok-vertical');
    const convertQuote = await createQuote(user.id, 'overlay', project.id, {
      parentJobId: first.jobIds[0],
      convertToPlatform: 'tiktok',
      request: 'Mach aus meinem Twitch Overlay eine TikTok-Version.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, convertQuote.id);
    const tiktok = await getOverlay(second.jobIds[0]!, user.id);
    assert.equal(tiktok?.width, OVERLAY_ASPECT_PRESETS['9:16'].width);
    assert.equal(tiktok?.config?.platform, 'tiktok');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-cv.test`, 'Q');
    await assert.rejects(
      () =>
        generateOverlayAsset(other.id, undefined, {
          parentJobId: first.jobIds[0],
          convertToPlatform: 'tiktok',
          platform: 'tiktok',
        }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'NOT_FOUND' || err.code === 'OVERLAY_NOT_FOUND')
    );
  });

  it('layout studio accepts owned overlay and rejects foreign overlay', async () => {
    const { user, project } = await seed();
    setOverlayTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'overlay', project.id, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const overlay = await requireOwnedOverlayJob(user.id, result.jobIds[0]!);
    const layout = await createLayout(user.id, {
      name: 'Obs Scene',
      platform: 'obs',
      canvas: { width: 1920, height: 1080 },
      elements: [
        {
          id: randomUUID(),
          type: 'overlay',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          sourceOverlayJobId: overlay.id,
        },
      ],
    });
    assert.equal(layout.elements[0]?.sourceOverlayJobId, overlay.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@overlay-lo.test`, 'L');
    await assert.rejects(
      () =>
        createLayout(other.id, {
          name: 'Steal',
          platform: 'obs',
          canvas: { width: 1920, height: 1080 },
          elements: [
            {
              id: randomUUID(),
              type: 'overlay',
              x: 0,
              y: 0,
              width: 1920,
              height: 1080,
              sourceOverlayJobId: overlay.id,
            },
          ],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'OVERLAY_NOT_FOUND'
    );
  });
});

describe('overlay closure — provider and payment safety', () => {
  it('keeps image providers and payments gated', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const ai = src('./ai.service.ts');
    assert.match(ai, /overlayTestHooks/);
    assert.match(ai, /OVERLAY_MOCK_PNG/);
    assert.match(ai, /isPaidProviderTestBlocked/);
  });
});
