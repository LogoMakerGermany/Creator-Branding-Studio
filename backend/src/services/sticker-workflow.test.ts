import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  STICKER_PLATFORM_SPECS,
  STICKER_SIZE_PRESETS,
  applyStickerChangeRequest,
  applyStickerPlatformPreset,
  stickerConfigFromDna,
  stickerConfigToGenerationOptions,
  stickerConfigFromGenerationOptions,
  stickerDownloadFilename,
  stickerNeedsFollowUp,
  buildStickerDesignSummary,
  defaultStickerConfig,
  detectDnaChangeScope,
  parseStickerIntent,
  sanitizeStickerStyleRequest,
  validateStickerDimensions,
  validateStickerFormat,
  validateStickerText,
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
  assertOwnedStickerReference,
  downloadSticker,
  generateStickerAsset,
  getSticker,
  listSticker,
  listStickerVersions,
  requireOwnedStickerJob,
  retryStickerJob,
  setStickerTestHooks,
  stickerProjectAssets,
} from './sticker.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { previewStreamsetDraft, requireOwnedLogoJob } from './streamset.service.js';
import { setLogoTestHooks } from './logo.service.js';
import { buildStickerPrompt } from './studio-prompt.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setStickerTestHooks(null);
  setLogoTestHooks(null);
});

after(() => {
  setStickerTestHooks(null);
  setLogoTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-close.test`, 'Mark');
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
  const project = await createProject(user.id, { name: 'Sticker Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('sticker closure — project, dna, config', () => {
  it('persists owned sticker project and does not rewrite DNA', async () => {
    const { user, project, dna } = await seed();
    const before = dna.version;
    setStickerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'sticker', project.id, {
      platform: 'tiktok',
      kind: 'sticker',
      width: 1024,
      height: 1024,
      format: 'png',
      transparentBackground: true,
      text: 'HYPE',
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getSticker(result.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.projectId, project.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.fileId);
    assert.equal(job?.width, 1024);
    assert.equal(job?.height, 1024);
    assert.equal(job?.transparentBackground, true);
    const listed = await listSticker(user.id);
    assert.ok(listed.some((j) => j.id === job?.id));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-b.test`, 'B');
    assert.equal(await getSticker(job!.id, other.id), null);
  });

  it('uses Creator DNA as defaults and works without DNA when a platform is given', async () => {
    const defaults = stickerConfigFromDna({
      name: 'NightWolf',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#7C3AED'],
      accentColors: [],
      styleDirection: 'esports',
      mascot: 'Wolf',
      brandingStyle: 'esports',
      platformOptimization: [{ platform: 'twitch', aspectRatios: ['1:1'], optimizations: [] }],
    });
    assert.equal(defaults.platform, 'twitch');
    assert.ok(defaults.colors?.includes('#1E40AF'));
    assert.equal(defaults.motif, 'Wolf');
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-nodna.test`, 'Solo');
    setStickerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'sticker', undefined, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getSticker(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(await getActiveDna(user.id), null);
  });

  it('validates dimensions, format, transparency, text, and prompt builder', () => {
    assert.equal(validateStickerDimensions(0, 512).ok, false);
    assert.equal(validateStickerDimensions(-1, 512).ok, false);
    assert.equal(validateStickerDimensions(Number.NaN, 512).ok, false);
    assert.equal(validateStickerDimensions(Number.POSITIVE_INFINITY, 512).ok, false);
    assert.equal(validateStickerDimensions(128, 128).ok, false);
    assert.equal(validateStickerDimensions(2048, 512).ok, false);
    assert.equal(validateStickerDimensions(512, 512).ok, true);
    assert.equal(validateStickerDimensions(800, 800).ok, true);
    assert.equal(validateStickerFormat('jpg', true).ok, false);
    assert.equal(validateStickerFormat('png', true).ok, true);
    assert.equal(validateStickerFormat('webp', true).ok, true);
    assert.equal(validateStickerText('').ok, true);
    assert.equal(validateStickerText('HYPE').ok, true);
    assert.equal(validateStickerText('x'.repeat(25)).ok, false);
    const tiktok = parseStickerIntent('Mach mir einen TikTok-Sticker.');
    assert.equal(tiktok.config.platform, 'tiktok');
    assert.equal(tiktok.config.width, STICKER_SIZE_PRESETS.standard.width);
    assert.match(tiktok.config.summary, /TikTok/i);
    const badge = parseStickerIntent('Mach mir ein GG-Badge.');
    assert.equal(badge.config.kind, 'badge');
    assert.equal(badge.config.text, 'GG');
    const emote = parseStickerIntent('Mach daraus ein Emote.');
    assert.equal(emote.config.kind, 'emote');
    const transparent = parseStickerIntent('Mach den Hintergrund transparent.');
    assert.equal(transparent.config.transparentBackground, true);
    const outline = parseStickerIntent('Mach einen weißen Rand drum.');
    assert.equal(outline.config.outline, 'medium');
    const custom = defaultStickerConfig({ platform: 'custom', width: 800, height: 800, sizePreset: 'custom' });
    assert.equal(custom.width, 800);
    assert.equal(custom.height, 800);
    const safe = sanitizeStickerStyleRequest('Kopiere exakt den Sticker von BrandX');
    assert.equal(/BrandX/i.test(safe) && /exakt den Sticker von BrandX/i.test(safe), false);
    assert.match(buildStickerDesignSummary(defaultStickerConfig({ platform: 'tiktok', text: 'HYPE' })), /HYPE/i);
    assert.equal(STICKER_PLATFORM_SPECS.discord.label, 'Discord');
    assert.equal(applyStickerPlatformPreset(defaultStickerConfig({ platform: 'twitch' }), 'tiktok').platform, 'tiktok');
    const cfg = defaultStickerConfig({ platform: 'twitch', kind: 'emote', outline: 'thick', text: 'LIVE' });
    const opts = stickerConfigToGenerationOptions(cfg);
    const roundtrip = stickerConfigFromGenerationOptions(opts);
    assert.equal(roundtrip.kind, cfg.kind);
    assert.equal(roundtrip.outline, cfg.outline);
    assert.equal(roundtrip.text, cfg.text);
    assert.equal(roundtrip.width, cfg.width);
  });
});

describe('sticker closure — nexter', () => {
  it('parses intents and asks follow-up instead of quoting vague sticker without platform', async () => {
    assert.equal(detectQuoteKind('Mach mir einen Sticker.'), 'sticker');
    assert.equal(detectQuoteKind('Mach mir ein Emote.'), 'sticker');
    assert.equal(detectQuoteKind('Mach mir ein GG-Badge.'), 'sticker');
    assert.equal(stickerNeedsFollowUp('Mach mir einen Sticker.'), true);
    assert.equal(stickerNeedsFollowUp('Mach mir einen TikTok-Sticker.'), false);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-fu.test`, 'Ask');
    const session = await nexterChat(user.id, 'Mach mir einen Sticker.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Twitch|TikTok|Plattform|Sticker Studio|Badge|Emote/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('does not auto-generate a multi-sticker batch', async () => {
    assert.equal(stickerNeedsFollowUp('Mach mir 6 TikTok-Sticker passend zu meinem Logo.'), true);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-batch.test`, 'Six');
    const session = await nexterChat(user.id, 'Mach mir 6 TikTok-Sticker passend zu meinem Logo.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /nicht automatisch|6/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), false);
    assert.equal((await listSticker(user.id)).length, 0);
  });

  it('concrete Nexter sticker request prepares a quote without starting a job or writing DNA', async () => {
    const { user, dna } = await seed();
    const before = dna.version;
    const session = await nexterChat(
      user.id,
      'Mach mir einen transparenten TikTok-Sticker, Text HYPE, weißer Rand, mehr Blau.'
    );
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), true);
    assert.equal((await listSticker(user.id)).length, 0);
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

describe('sticker closure — quote, mock, refund, result', () => {
  it('requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/studio.routes.ts');
    assert.match(routes, /STICKER_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'sticker', project.id, { platform: 'twitch' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'sticker', project.id, { platform: 'twitch' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listSticker(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setStickerTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'sticker', project.id, { platform: 'twitch' });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.STICKER_GENERATION]);
  });

  it('mock success persists owned result; failure refunds once; retry needs quote', async () => {
    const { user, project } = await seed();
    setStickerTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'sticker', project.id, { platform: 'twitch' });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setStickerTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'sticker', project.id, {
      platform: 'tiktok',
      format: 'png',
      transparentBackground: true,
      text: 'HYPE',
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getSticker(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    const fileId = String(job!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadSticker(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadSticker(job!.id, user.id);
    assert.ok(again.downloadUrl);
    assert.match(dl.filename, /nightwolf|tiktok|hype|sticker-v/i);
    assert.equal(
      stickerDownloadFilename({ creatorName: 'Night Wolf!', platform: 'tiktok', text: 'HYPE', kind: 'sticker', version: 1, ext: 'png' }),
      'night-wolf-tiktok-hype-sticker-v1.png'
    );
    assert.equal(
      stickerDownloadFilename({ creatorName: '../etc/passwd', platform: 'twitch', version: 1, ext: 'png' }).includes('..'),
      false
    );
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-d.test`, 'D');
    await assert.rejects(() => downloadSticker(job!.id, other.id));
    await assert.rejects(
      () => retryStickerJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setStickerTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'sticker', project.id, { platform: 'twitch' });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listSticker(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    await assert.rejects(
      () => retryStickerJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'STICKER_REQUIRES_QUOTE'
    );
  });

  it('rejects JPG transparency and accepts PNG/WebP', async () => {
    const { user, project } = await seed();
    setStickerTestHooks({ result: 'success' });
    await assert.rejects(
      () =>
        generateStickerAsset(user.id, project.id, {
          platform: 'twitch',
          format: 'jpg',
          transparentBackground: true,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'STICKER_FORMAT_INVALID'
    );
    const quote = await createQuote(user.id, 'sticker', project.id, {
      platform: 'twitch',
      format: 'webp',
      transparentBackground: true,
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getSticker(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.mimeType, 'image/webp');
  });

  it('rejects batch count and keeps prompt/job parity', async () => {
    const { user, project } = await seed();
    setStickerTestHooks({ result: 'success' });
    await assert.rejects(
      () => generateStickerAsset(user.id, project.id, { platform: 'tiktok', requestedCount: 6 }),
      (err: unknown) => err instanceof ServiceError && err.code === 'STICKER_BATCH_NOT_SUPPORTED'
    );
    const cfg = defaultStickerConfig({ platform: 'tiktok', text: 'HYPE', transparentBackground: true, outline: 'medium' });
    const prompt = buildStickerPrompt(
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
      stickerConfigToGenerationOptions(cfg)
    );
    assert.match(prompt, /TRANSPARENT|transparent/i);
    assert.match(prompt, /HYPE/);
    assert.match(prompt, /1024/);
    assert.match(prompt, /MAIN SUBJECT|cutout/i);
  });

  it('change/variant reuses config, versions, and does not mutate DNA', async () => {
    const { user, project, dna } = await seed();
    setStickerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'sticker', project.id, {
      platform: 'twitch',
      kind: 'sticker',
      outline: 'medium',
      text: 'GG',
    });
    const first = await confirmQuote(user.id, quote.id);
    const changed = applyStickerChangeRequest(
      defaultStickerConfig({ platform: 'twitch', outline: 'medium', text: 'GG' }),
      'Figur kleiner. Rand dicker. Mehr Blau. Mach HYPE statt GG.'
    );
    assert.equal(changed.outline, 'thick');
    assert.equal(changed.text, 'HYPE');
    const change = await createQuote(user.id, 'sticker', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Ändere meinen Sticker: Figur kleiner. Rand dicker.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getSticker(second.jobIds[0]!, user.id);
    assert.ok(variant);
    const versions = await listStickerVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);
    const listed = await listSticker(user.id);
    assert.ok(listed.some((j) => j.id === first.jobIds[0]));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('sticker closure — logo, streamset, project, references', () => {
  it('accepts owned logo and rejects foreign assets and external URLs', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    setStickerTestHooks({ result: 'success' });
    const logoQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const logoRes = await confirmQuote(user.id, logoQuote.id);
    const logo = await requireOwnedLogoJob(user.id, logoRes.jobIds[0]!);
    const stickerQuote = await createQuote(user.id, 'sticker', project.id, {
      platform: 'tiktok',
      sourceLogoJobId: logo.id,
    });
    const stickerRes = await confirmQuote(user.id, stickerQuote.id);
    const sticker = await getSticker(stickerRes.jobIds[0]!, user.id);
    assert.equal(sticker?.status, 'completed');

    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-logo.test`, 'X');
    await assert.rejects(
      () => generateStickerAsset(other.id, undefined, { platform: 'tiktok', sourceLogoJobId: logo.id }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'LOGO_NOT_FOUND' || err.code === 'FOREIGN_REFERENCE')
    );
    await assert.rejects(
      () => generateStickerAsset(user.id, undefined, { platform: 'tiktok', referenceUrl: 'https://evil.example/f.png' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NO_EXTERNAL_URL'
    );
  });

  it('sticker without reference still completes', async () => {
    const { user, project } = await seed();
    setStickerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'sticker', project.id, { platform: 'general' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getSticker(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.config?.logoJobId, undefined);
  });

  it('accepts owned reference images and rejects foreign and SVG files', async () => {
    const { user } = await seed();
    const PIXEL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const owned = await saveUserFile(user.id, {
      name: 'ref.png',
      mimeType: 'image/png',
      category: 'sticker',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assertOwnedStickerReference(user.id, owned.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-ref.test`, 'X');
    const foreign = await saveUserFile(other.id, {
      name: 'steal.png',
      mimeType: 'image/png',
      category: 'sticker',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assert.rejects(
      () => assertOwnedStickerReference(user.id, foreign.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_REFERENCE'
    );
    const svgId = randomUUID();
    await dsSet('files', svgId, {
      id: svgId,
      userId: user.id,
      name: 'x.svg',
      mimeType: 'image/svg+xml',
      size: 12,
      category: 'sticker',
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => assertOwnedStickerReference(user.id, svgId),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_REFERENCE_MIME'
    );
  });

  it('own sticker attaches as project asset and can seed streamset draft; foreign sticker is rejected', async () => {
    const { user, project } = await seed();
    setStickerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'sticker', project.id, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const sticker = await requireOwnedStickerJob(user.id, result.jobIds[0]!);
    const projectRow = await getProject(project.id, user.id);
    assert.ok(projectRow?.assets.some((a) => a.jobId === sticker.id || a.module === 'sticker'));
    const attached = await stickerProjectAssets(user.id, project.id);
    assert.ok(attached.length >= 1);
    const draft = await previewStreamsetDraft(user.id, { projectId: project.id, selectedKeys: ['sticker'] });
    assert.ok(draft.selectedKeys.includes('sticker'));
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@sticker-ss.test`, 'Z');
    await assert.rejects(() => requireOwnedStickerJob(other.id, sticker.id));
  });
});

describe('sticker closure — provider and payment safety', () => {
  it('keeps image providers and payments gated', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const ai = src('./ai.service.ts');
    assert.match(ai, /stickerTestHooks/);
    assert.match(ai, /STICKER_MOCK_PNG/);
    assert.match(ai, /isPaidProviderTestBlocked/);
    const page = readFileSync(join(dir, '../../../frontend/src/pages/studios/StickerStudioPage.tsx'), 'utf8');
    assert.match(page, /sticker-nexter-chip/);
    assert.match(page, /sticker-local-preview/);
    assert.match(page, /min-h-11/);
    assert.match(page, /aria-label/);
  });
});
